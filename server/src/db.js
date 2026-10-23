'use strict';
const Database = require('better-sqlite3');

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

function open(file) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  if (!db.prepare('PRAGMA table_info(events)').all().some(c => c.name === 'extra')) db.exec('ALTER TABLE events ADD COLUMN extra TEXT');
  return db;
}

module.exports = { open };
