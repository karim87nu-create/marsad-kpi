// A database lease coordinates completed queue snapshots across Worker isolates.
// No request ever awaits another request's I/O promise.
export async function takeTransferBuildLease(db, day, now) {
  const key = 'transfer-build:' + day;
  const value = String(now + 30000);
  const r = await db.prepare(`INSERT INTO settings (key,value) VALUES (?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
    WHERE CAST(settings.value AS INTEGER) <= ?`).run(key, value, now);
  if (!r.changes) return null;
  return () => db.prepare('DELETE FROM settings WHERE key=? AND value=?').run(key, value);
}

// Only explicit actions wait; ordinary polling never piles up waiting requests.
export async function waitForTransferBuild(db, day, previousAt, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt=0; attempt<8; attempt++) {
    await sleep(250 * (attempt + 1));
    const row = await db.prepare('SELECT at, data FROM transfer_cache WHERE day = ?').get(day);
    if (!row || row.at <= previousAt) continue;
    let saved; try { saved = JSON.parse(row.data); } catch { continue; }
    if (saved && Array.isArray(saved.list) && saved.at === row.at) return saved;
  }
  return null;
}
