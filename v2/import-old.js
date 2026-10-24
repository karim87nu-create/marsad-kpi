// نقل بيانات النظام القديم من الصفحة نفسها: الملف بيتفك ويتحوّل هنا في المتصفح، والصفوف بتتبعت للسيرفر على دفعات.
// The old database is opened as an in-memory copy (sql.js); the file the person picked is never changed.
import { convertOld, IMPORT_TABLES } from './lib/import-convert.js?v=2';
import { SCHEMA_STATEMENTS } from './lib/db.js';

const norm = p => p.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v));

// sql.js behind the small part of the better-sqlite3 API that import-convert.js uses.
function shim(db) {
  const cache = new Map();
  const stmt = sql => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); cache.set(sql, s); } return s; };
  const rows = function* (sql, p) {
    const s = db.prepare(sql);                                    // own statement: iterations may overlap
    try { s.bind(norm(p)); while (s.step()) yield s.getAsObject(); } finally { s.free(); }
  };
  return {
    prepare: sql => ({
      all: (...p) => [...rows(sql, p)],
      get: (...p) => { for (const r of rows(sql, p)) return r; return undefined; },
      iterate: (...p) => rows(sql, p),
      run: (...p) => {
        stmt(sql).run(norm(p));
        // Read on first use only (most inserts never need it), then kept: later inserts change last_insert_rowid().
        let id;
        return { changes: db.getRowsModified(), get lastInsertRowid() { return id ??= Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0]); } };
      },
    }),
    transaction: fn => (...a) => {
      db.run('BEGIN');
      try { const r = fn(...a); db.run('COMMIT'); return r; } catch (e) { db.run('ROLLBACK'); throw e; }
    },
    free: () => { for (const s of cache.values()) s.free(); cache.clear(); },
  };
}

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u64 = (b, o) => u32(b, o) + u32(b, o + 4) * 2 ** 32;
const bytesOf = async blob => new Uint8Array(await blob.arrayBuffer());
const inflate = (blob, format) => new Response(blob.stream().pipeThrough(new DecompressionStream(format))).arrayBuffer().then(b => new Uint8Array(b));

// The database inside a ChatGPT code export (.zip), a .gz, or the .sqlite file itself.
async function unpack(file, say = () => {}) {
  const head = await bytesOf(file.slice(0, 16));
  if (head[0] === 0x1f && head[1] === 0x8b) { say('جارٍ فك الضغط…'); return inflate(file, 'gzip'); }
  if (String.fromCharCode(...head) === 'SQLite format 3\u0000') return bytesOf(file);
  if (!(head[0] === 0x50 && head[1] === 0x4b)) throw Error('الملف لازم يكون zip أو sqlite');
  const tail = await bytesOf(file.slice(Math.max(0, file.size - 65557)));
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw Error('ملف الـ zip ناقص أو بايظ');
  let count = u16(tail, e + 10), size = u32(tail, e + 12), offset = u32(tail, e + 16);
  if (offset === 0xffffffff || count === 0xffff) {                 // zip64
    const loc = e - 20;
    if (loc < 0 || u32(tail, loc) !== 0x07064b50) throw Error('ملف الـ zip مش مدعوم');
    const rec = await bytesOf(file.slice(u64(tail, loc + 8), u64(tail, loc + 8) + 56));
    count = u64(rec, 32); size = u64(rec, 40); offset = u64(rec, 48);
  }
  const dir = await bytesOf(file.slice(offset, offset + size));
  const entries = [];
  for (let p = 0, n = 0; n < count && u32(dir, p) === 0x02014b50; n++) {
    const nameLen = u16(dir, p + 28), extraLen = u16(dir, p + 30), commentLen = u16(dir, p + 32);
    const x = { method: u16(dir, p + 10), compressed: u32(dir, p + 20), size: u32(dir, p + 24), local: u32(dir, p + 42), name: new TextDecoder().decode(dir.subarray(p + 46, p + 46 + nameLen)) };
    for (let q = p + 46 + nameLen; q < p + 46 + nameLen + extraLen;) {   // zip64 sizes
      const id = u16(dir, q), len = u16(dir, q + 2); let r = q + 4;
      if (id === 1) { if (x.size === 0xffffffff) { x.size = u64(dir, r); r += 8; } if (x.compressed === 0xffffffff) { x.compressed = u64(dir, r); r += 8; } if (x.local === 0xffffffff) x.local = u64(dir, r); }
      q += 4 + len;
    }
    entries.push(x);
    p += 46 + nameLen + extraLen + commentLen;
  }
  const pick = entries.filter(x => /\.(sqlite3?|db)$/i.test(x.name)).sort((a, b) => (/marsad/i.test(b.name) - /marsad/i.test(a.name)) || b.size - a.size)[0];
  if (!pick) throw Error('مفيش قاعدة بيانات SQLite جوه الـ zip');
  say('جارٍ فك ' + pick.name + ' (' + Math.round(pick.size / 1048576) + ' ميجا)…');
  const local = await bytesOf(file.slice(pick.local, pick.local + 30));
  const start = pick.local + 30 + u16(local, 26) + u16(local, 28);
  const data = file.slice(start, start + pick.compressed);
  if (pick.method === 0) return bytesOf(data);
  if (pick.method === 8) return inflate(data, 'deflate-raw');
  throw Error('طريقة ضغط مش مدعومة في الـ zip');
}

// Old database bytes → a new database with this server's tables, filled by import-convert.js.
function convert(SQL, bytes, log = () => {}) {
  const oldDb = new SQL.Database(bytes);
  const target = new SQL.Database();
  for (const s of SCHEMA_STATEMENTS) target.run(s);
  try { target.exec('SELECT extra FROM events LIMIT 0'); } catch { target.run('ALTER TABLE events ADD COLUMN extra TEXT'); }
  const old = shim(oldDb), t = shim(target);
  try { return { target, report: convertOld(t, old, { log }) }; } finally { old.free(); t.free(); oldDb.close(); }
}

const NATURAL = { events: ['session_id', 'event_key'], live_snapshots: ['capture_id'], shift_decisions: ['request_id'], audit: ['details'] };

// Sends every converted row, a chunk at a time. post(body) → server answer; a failed chunk is retried.
async function send(target, post, progress = () => {}, { bytes: chunkBytes = 1500000 } = {}) {
  const total = IMPORT_TABLES.reduce((n, t) => n + target.exec('SELECT COUNT(*) FROM ' + t)[0].values[0][0], 0);
  let done = 0;
  const retry = async body => {
    for (let i = 0; ; i++) {
      try { return await post(body); } catch (e) { if (i >= 4 || e.status === 400 || e.status === 403 || e.status === 409) throw e; await new Promise(r => setTimeout(r, 2000 * (i + 1))); }
    }
  };
  for (const table of IMPORT_TABLES) {
    const info = target.exec('PRAGMA table_info(' + table + ')')[0].values;   // [cid, name, type, notnull, default, pk]
    // Rows are matched to the copy sent last time by a key that stays the same between two copies of the old
    // database: their own natural key where they have one (their ids here depend on what came before them), the old
    // id inside details for the log (see import-rows.js), the primary key for the rest.
    const natural = NATURAL[table];
    const columns = info.map(c => c[1]).filter(c => !(natural && c === 'id'));
    const key = natural || info.filter(c => c[5] > 0).sort((a, b) => a[5] - b[5]).map(c => c[1]);
    const chunkRows = Math.min(1000, 40 * Math.max(1, Math.floor(100 / columns.length)));   // the server's per-request limit (import-rows.js)
    const s = target.prepare('SELECT ' + columns.join(', ') + ' FROM ' + table + ' ORDER BY rowid');
    let rows = [], size = 0;
    const flush = async () => { if (!rows.length) return; await retry({ action: 'rows', table, columns, key, rows }); done += rows.length; progress(done, total, table); rows = []; size = 0; };
    try {
      while (s.step()) {
        const r = s.get().map(v => (v instanceof Uint8Array ? null : v));
        rows.push(r); size += r.reduce((n, v) => n + (typeof v === 'string' ? v.length * 2 : 8), 16);
        if (rows.length >= chunkRows || size >= chunkBytes) await flush();
      }
      await flush();
    } finally { s.free(); }
  }
  return total;
}

// After the switch to this server: only what is missing (see /api/import-old/backfill). post(path, body).
async function backfill(target, post, progress = () => {}) {
  const q = (sql, ...p) => { const s = target.prepare(sql); try { s.bind(p); const out = []; while (s.step()) out.push(s.get()); return out; } finally { s.free(); } };
  const cols = table => target.exec('PRAGMA table_info(' + table + ')')[0].values.map(c => c[1]);
  const { legacyThrough } = await post({ action: 'status' });
  const cutoff = legacyThrough ? legacyThrough - 6 * 3600000 : 0;          // a margin before the last old event already here
  const plan = [];
  const add = (table, columns, rows) => plan.push({ table, columns, rows });
  const plain = table => { const c = cols(table); add(table, c, q('SELECT ' + c.join(', ') + ' FROM ' + table)); };
  plain('employees'); plain('admin_accounts');
  const sc = cols('employee_sessions').filter(c => c !== 'id');
  add('employee_sessions', sc, q('SELECT ' + sc.join(', ') + ' FROM employee_sessions WHERE COALESCE(last_seen, 0) >= ? OR issued_at >= ? OR COALESCE(revoked_at, 0) >= ? ORDER BY issued_at', cutoff, cutoff, cutoff));
  for (const [table, time] of [['events', 'occurred_at'], ['shift_decisions', 'decided_at']]) {
    const c = cols(table).filter(x => x !== 'id' && x !== 'session_id');
    add(table, [...c, 'device'], q('SELECT ' + c.map(x => 't.' + x).join(', ') + ', s.device FROM ' + table + ' t JOIN employee_sessions s ON s.id = t.session_id WHERE t.' + time + ' >= ? ORDER BY t.' + time, cutoff));
  }
  const lc = cols('live_snapshots').filter(c => c !== 'id');
  add('live_snapshots', lc, q('SELECT ' + lc.join(', ') + ' FROM live_snapshots WHERE observed_at >= ?', cutoff));
  for (const t of ['messages', 'message_recipients', 'reviews', 'saved_reports']) plain(t);
  const ac = cols('audit').filter(c => c !== 'id');
  add('audit', ac, q('SELECT ' + ac.join(', ') + ' FROM audit WHERE occurred_at >= ?', cutoff));
  const firstDay = cutoff ? new Date(cutoff - 864e5).toISOString().slice(0, 10) : '0000-00-00';
  const days = q('SELECT id, date, imported_at, source, verified_total, expected_count, header, fingerprint FROM history_reports WHERE date >= ? ORDER BY date', firstDay);
  const total = plan.reduce((n, p) => n + p.rows.length, 0) + days.length;
  let done = 0;
  for (const { table, columns, rows } of plan) {
    // Requests stay within the server's limits: 20 sessions (two statements each), 100 sessions per events chunk.
    const size = table === 'employee_sessions' ? 20 : Math.min(1000, 40 * Math.max(1, Math.floor(100 / columns.length)));
    for (let i = 0; i < rows.length;) {
      let part = rows.slice(i, i + size);
      if (columns.includes('device')) { const at = columns.indexOf('device'), seen = new Set(); let k = 0; for (; k < part.length; k++) { seen.add(part[k][at]); if (seen.size > 100) break; } part = part.slice(0, k); }
      await post({ action: 'rows', table, columns, rows: part.map(r => r.map(v => (v instanceof Uint8Array ? null : v))) });
      i += part.length; done += part.length; progress(done, total);
    }
  }
  for (const [id, date, imported_at, source, verified_total, expected_count, header, fingerprint] of days) {
    const calls = q('SELECT raw FROM history_calls WHERE report_id = ? ORDER BY idx', id).map(r => r[0]);
    await post({ action: 'history', date, report: { imported_at, source, verified_total, expected_count, header, fingerprint }, calls });
    progress(++done, total);
  }
  return { sessions: plan.find(p => p.table === 'employee_sessions').rows.length, events: plan.find(p => p.table === 'events').rows.length, historyDays: days.length };
}

let sqlJs = null;
function loadSqlJs(base) {
  sqlJs ??= new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = base + 'vendor/sql-wasm.js';
    tag.onload = () => globalThis.initSqlJs({ locateFile: f => base + 'vendor/' + f }).then(resolve, reject);
    tag.onerror = () => reject(Error('تعذر تحميل أداة قراءة قاعدة البيانات'));
    document.head.append(tag);
  });
  return sqlJs;
}

// The whole move, as the admin page runs it.
async function run({ file, post, say, base, mode = 'full', postBackfill }) {
  say('جارٍ التجهيز…');
  const SQL = await loadSqlJs(base);
  let bytes = await unpack(file, say);
  if (String.fromCharCode(...bytes.subarray(0, 16)) !== 'SQLite format 3\u0000') throw Error('الملف مش قاعدة بيانات SQLite');
  say('جارٍ تحويل البيانات (' + Math.round(bytes.length / 1048576) + ' ميجا)… ممكن ياخد دقيقة.');
  await new Promise(r => setTimeout(r, 50));
  const { target, report } = convert(SQL, bytes, m => console.log('[import]', m));
  bytes = null;
  try {
    if (mode === 'backfill') {
      const r = await backfill(target, postBackfill, (n, total) => say('جارٍ رفع الناقص: ' + n.toLocaleString('en') + ' من ' + total.toLocaleString('en') + ' (' + Math.floor(n * 100 / Math.max(1, total)) + '٪)… متقفلش الصفحة.'));
      await postBackfill({ action: 'finish', report: r });
      return { ...report, backfill: r };
    }
    await post({ action: 'begin' });
    await send(target, post, (n, total) => say('جارٍ الرفع: ' + n.toLocaleString('en') + ' من ' + total.toLocaleString('en') + ' (' + Math.floor(n * 100 / total) + '٪)… متقفلش الصفحة.'));
    await post({ action: 'finish', report });
  } finally { target.close(); }
  return report;
}

export { shim, unpack, convert, send, backfill, run };
