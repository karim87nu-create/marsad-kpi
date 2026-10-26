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
CREATE TABLE IF NOT EXISTS orders_days (day TEXT PRIMARY KEY, data TEXT NOT NULL, received_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS site_orders (id INTEGER PRIMARY KEY, day TEXT NOT NULL, status TEXT, fulfillment TEXT, total REAL, created_at INTEGER NOT NULL, modified_at INTEGER, notes_at INTEGER, received_at INTEGER, transfer_at INTEGER, branch TEXT, out_at INTEGER, driver TEXT, delivered_at INTEGER, scheduled INTEGER NOT NULL DEFAULT 0, transfers INTEGER);
CREATE INDEX IF NOT EXISTS site_orders_day ON site_orders(day);
CREATE INDEX IF NOT EXISTS site_orders_created ON site_orders(created_at);
CREATE TABLE IF NOT EXISTS talabat_orders (id TEXT PRIMARY KEY, day TEXT NOT NULL, vendor_id TEXT, store TEXT, status TEXT, billable TEXT, placed_at INTEGER, total REAL, received_at INTEGER, accept_seconds INTEGER, accepted_at INTEGER, picked_up_at INTEGER, delivered_at INTEGER, cancelled_at INTEGER, cancel_owner TEXT, cancel_reason TEXT, items TEXT, subtotal REAL, delivery_type TEXT, code TEXT, milestones TEXT, detail_at INTEGER, first_seen INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS talabat_orders_day ON talabat_orders(day);
CREATE TABLE IF NOT EXISTS talabat_links (talabat_id TEXT PRIMARY KEY, day TEXT NOT NULL, apex_no TEXT, set_by TEXT, set_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS learned (kind TEXT NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL, ref TEXT NOT NULL, value REAL, at INTEGER NOT NULL, PRIMARY KEY (kind, a, b, ref));
CREATE TABLE IF NOT EXISTS exception_reviews (key TEXT PRIMARY KEY, source TEXT, ref TEXT, day TEXT NOT NULL, verdict TEXT NOT NULL, reason TEXT, note TEXT, signature TEXT, by_name TEXT, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS exception_reviews_day ON exception_reviews(day);
CREATE TABLE IF NOT EXISTS cancel_owners (key TEXT PRIMARY KEY, day TEXT NOT NULL, source TEXT, ref TEXT, owner TEXT NOT NULL, name TEXT, reason_key TEXT, by_name TEXT, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS cancel_owners_day ON cancel_owners(day);
CREATE TABLE IF NOT EXISTS wa_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, talabat_id TEXT UNIQUE NOT NULL, day TEXT NOT NULL, phone TEXT, created_at INTEGER NOT NULL, welcome_at INTEGER, survey_at INTEGER, tries INTEGER NOT NULL DEFAULT 0, error TEXT);
CREATE INDEX IF NOT EXISTS wa_messages_day ON wa_messages(day);
CREATE TABLE IF NOT EXISTS apex_names (apex_name TEXT PRIMARY KEY, employee_id INTEGER NOT NULL, set_at INTEGER NOT NULL);
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
  try { await db.prepare('SELECT code, milestones FROM talabat_orders LIMIT 0').all(); } catch { for (const c of ['code TEXT', 'milestones TEXT']) { try { await db.prepare('ALTER TABLE talabat_orders ADD COLUMN ' + c).run(); } catch {} } }
  try { await db.prepare('SELECT transfers FROM site_orders LIMIT 0').all(); } catch { try { await db.prepare('ALTER TABLE site_orders ADD COLUMN transfers INTEGER').run(); } catch {} }
  try { await db.prepare('SELECT total FROM site_orders LIMIT 0').all(); } catch { try { await db.prepare('ALTER TABLE site_orders ADD COLUMN total REAL').run(); } catch {} }
  // Two groups: the call center's (default) and the branch managers' (target = 'branches').
  try { await db.prepare('SELECT target FROM telegram_log LIMIT 0').all(); } catch { try { await db.prepare('ALTER TABLE telegram_log ADD COLUMN target TEXT').run(); } catch {} }
  try { await db.prepare('SELECT branch FROM telegram_log LIMIT 0').all(); } catch { try { await db.prepare('ALTER TABLE telegram_log ADD COLUMN branch TEXT').run(); } catch {} }
  try { await db.prepare('SELECT branch_chat_id, branch_chat_title FROM telegram_config LIMIT 0').all(); } catch {
    for (const c of ['branch_chat_id TEXT', 'branch_chat_title TEXT']) { try { await db.prepare('ALTER TABLE telegram_config ADD COLUMN ' + c).run(); } catch {} }
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
