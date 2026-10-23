// better-sqlite3 behind the same async interface as D1 (Node only: tests, local runs, scripts).
import Database from 'better-sqlite3';
import { migrate, norm } from './db.js';

function sqliteAdapter(raw) {
  const cache = new Map();
  const stmt = sql => { let s = cache.get(sql); if (!s) { s = raw.prepare(sql); cache.set(sql, s); } return s; };
  const exec = (sql, p) => { const s = stmt(sql); if (s.reader) return { rows: s.all(...p), changes: 0, lastInsertRowid: 0 }; const r = s.run(...p); return { rows: [], changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid) }; };
  return {
    kind: 'sqlite',
    raw,
    prepare: sql => ({
      all: async (...p) => stmt(sql).all(...norm(p)),
      get: async (...p) => stmt(sql).get(...norm(p)),
      run: async (...p) => { const r = exec(sql, norm(p)); return { changes: r.changes, lastInsertRowid: r.lastInsertRowid }; },
      bind: (...p) => ({ sql, params: norm(p) }),
    }),
    batch: async list => raw.transaction(() => list.map(b => exec(b.sql, b.params)))(),
  };
}

async function open(file) {
  const raw = new Database(file);
  if (file !== ':memory:') raw.pragma('journal_mode = WAL');
  raw.pragma('busy_timeout = 5000');
  const db = sqliteAdapter(raw);
  await migrate(db);
  return db;
}

export { open, sqliteAdapter };
