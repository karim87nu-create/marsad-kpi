// Database: one schema, two engines with the same async interface.
//   Node (tests, local runs): better-sqlite3 — see node-db.js
//   ChatGPT Sites / Cloudflare: D1 — see d1Adapter below
// Interface: db.prepare(sql).all(...p) / .get(...p) / .run(...p) → Promise; .bind(...p) for db.batch([...]) (atomic).

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS admin_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','supervisor','viewer')),
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,           -- 0 = master password
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  employee_code TEXT NOT NULL,
  pin_hash TEXT,                         -- scrypt; NULL until a PIN is set
  pin_lookup TEXT,                       -- HMAC of PIN, keeps PINs unique
  legacy_pin_hash TEXT,                  -- imported from the old server, verified on first login
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS employees_code ON employees(employee_code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employees_pin ON employees(pin_lookup) WHERE deleted_at IS NULL AND pin_lookup IS NOT NULL;

CREATE TABLE IF NOT EXISTS employee_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  device TEXT NOT NULL,
  extension TEXT NOT NULL DEFAULT '',
  issued_at INTEGER NOT NULL,
  bound_at INTEGER,
  work_started_at INTEGER,
  last_seen INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  revoke_reason TEXT,
  client_version TEXT
);
CREATE INDEX IF NOT EXISTS sessions_employee ON employee_sessions(employee_id, issued_at);
CREATE INDEX IF NOT EXISTS sessions_time ON employee_sessions(issued_at);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  extension TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  event_key TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  duration_seconds INTEGER,
  state TEXT,
  call_id TEXT,
  phone TEXT,
  queue TEXT,
  call_type TEXT,
  client_version TEXT,
  payload TEXT,
  extra TEXT, -- other top-level fields the extension sent (the old server kept the whole event body)
  UNIQUE (session_id, event_key)
);
CREATE INDEX IF NOT EXISTS events_time ON events(occurred_at);
CREATE INDEX IF NOT EXISTS events_session ON events(session_id, occurred_at);

CREATE TABLE IF NOT EXISTS break_permissions (
  id TEXT PRIMARY KEY,
  session_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  extension TEXT NOT NULL,
  request_id TEXT,
  allowed_seconds INTEGER NOT NULL,
  grace_seconds INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE TABLE IF NOT EXISTS break_requests (
  id TEXT PRIMARY KEY,
  employee_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  extension TEXT NOT NULL,
  reason_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  request_kind TEXT NOT NULL,
  requested_minutes INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  decided_by TEXT,
  permission_id TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_by TEXT
);
CREATE TABLE IF NOT EXISTS message_recipients (
  message_id TEXT NOT NULL,
  employee_id INTEGER NOT NULL,
  delivered_at INTEGER,
  acknowledged_at INTEGER,
  PRIMARY KEY (message_id, employee_id)
);

CREATE TABLE IF NOT EXISTS shift_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT UNIQUE,
  employee_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('include','exclude')),
  note TEXT NOT NULL,
  decided_at INTEGER NOT NULL,
  decided_by TEXT
);

CREATE TABLE IF NOT EXISTS history_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  imported_at INTEGER NOT NULL,
  source TEXT NOT NULL,
  verified_total INTEGER NOT NULL,
  expected_count INTEGER,
  header TEXT NOT NULL,
  fingerprint TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS history_reports_date ON history_reports(date, imported_at);
CREATE TABLE IF NOT EXISTS history_calls (
  report_id INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  raw TEXT NOT NULL,
  PRIMARY KEY (report_id, idx)
);

CREATE TABLE IF NOT EXISTS live_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  capture_id TEXT UNIQUE NOT NULL,
  observed_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  changed INTEGER NOT NULL,
  rows TEXT NOT NULL,
  waiting INTEGER NOT NULL,
  active INTEGER NOT NULL,
  longest_wait INTEGER
);
CREATE INDEX IF NOT EXISTS live_time ON live_snapshots(observed_at);

CREATE TABLE IF NOT EXISTS collector_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL,
  refresh_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  token_expires_at INTEGER NOT NULL,
  refresh_expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  reference TEXT NOT NULL,
  employee_id INTEGER,
  title TEXT NOT NULL,
  owner TEXT,
  status TEXT NOT NULL,
  note TEXT,
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  UNIQUE (date, reference)
);
CREATE TABLE IF NOT EXISTS saved_reports (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  filters TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at INTEGER NOT NULL,
  action TEXT NOT NULL,
  employee_id INTEGER,
  details TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_time ON audit(occurred_at);
`;


// Telegram tables live here too so a fresh database has everything.
const EXTRA_SCHEMA = `
CREATE TABLE IF NOT EXISTS telegram_config (id INTEGER PRIMARY KEY CHECK (id = 1), bot_token TEXT, bot_name TEXT, chat_id TEXT, chat_title TEXT, enabled INTEGER NOT NULL DEFAULT 0, rules TEXT, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS telegram_log (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, employee_id INTEGER, text TEXT NOT NULL, created_at INTEGER NOT NULL, sent_at INTEGER, tries INTEGER NOT NULL DEFAULT 0, error TEXT);
CREATE INDEX IF NOT EXISTS telegram_log_time ON telegram_log(created_at);
CREATE INDEX IF NOT EXISTS events_employee_time ON events(employee_id, occurred_at);
CREATE TABLE IF NOT EXISTS call_assignments (call_key TEXT PRIMARY KEY, employee_id INTEGER NOT NULL, decided_at INTEGER NOT NULL, decided_by TEXT, note TEXT);
`;

// Statements one by one (D1 runs one statement per call); comments removed.
const statements = sql => sql.replace(/--[^\n]*/g, '').split(';').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
const SCHEMA_STATEMENTS = [...statements(SCHEMA), ...statements(EXTRA_SCHEMA)];

const norm = p => p.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

async function migrate(db) {
  await db.batch(SCHEMA_STATEMENTS.map(s => db.prepare(s).bind()));
  // Older local files: the events.extra column came later.
  try { await db.prepare('SELECT extra FROM events LIMIT 0').all(); } catch { await db.prepare('ALTER TABLE events ADD COLUMN extra TEXT').run(); }
  // Telegram follow-ups are sent as replies to the alert they close.
  try { await db.prepare('SELECT reply_to, message_id FROM telegram_log LIMIT 0').all(); } catch {
    for (const c of ['reply_to TEXT', 'message_id INTEGER']) { try { await db.prepare('ALTER TABLE telegram_log ADD COLUMN ' + c).run(); } catch {} }
  }
}

function d1Adapter(d1) {
  const st = (sql, p) => d1.prepare(sql).bind(...norm(p));
  return {
    kind: 'd1',
    prepare: sql => ({
      all: async (...p) => (await st(sql, p).all()).results,
      get: async (...p) => (await st(sql, p).first()) ?? undefined,
      run: async (...p) => { const r = await st(sql, p).run(); return { changes: r.meta?.changes ?? 0, lastInsertRowid: Number(r.meta?.last_row_id ?? 0) }; },
      bind: (...p) => ({ sql, params: norm(p) }),
    }),
    batch: async list => list.length ? (await d1.batch(list.map(b => st(b.sql, b.params)))).map(r => ({ rows: r.results, changes: r.meta?.changes ?? 0, lastInsertRowid: Number(r.meta?.last_row_id ?? 0) })) : [],
  };
}

export { SCHEMA, SCHEMA_STATEMENTS, migrate, d1Adapter, norm };
