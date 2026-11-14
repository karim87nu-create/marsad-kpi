export const CANCELLED_SQL = "LOWER(REPLACE(TRIM(COALESCE(status,'')),'wc-','')) IN ('cancelled','canceled','rejected','failed','wallet-failed','refunded')";
export function isCancelled(status) {
  return ['cancelled','canceled','rejected','failed','wallet-failed','refunded'].includes(String(status || '').trim().toLowerCase().replace(/^wc-/,''));
}
export async function sourceCanTransfer(db, source, ref) {
  if (!['site','talabat'].includes(source)) return false;
  const table = source === 'site' ? 'site_orders' : 'talabat_orders';
  const row = await db.prepare(`SELECT status FROM ${table} WHERE id=?`).get(ref);
  return !!row && !isCancelled(row.status);
}
// Single statement: cancellation arriving after the caller's check still wins.
export async function handoffPending(db, source, ref, state, now) {
  const table = source === 'site' ? 'site_orders' : 'talabat_orders';
  return db.prepare(`UPDATE transfer_jobs SET state='auto_sending', at=?
    WHERE source=? AND ref=? AND state=? AND at<=?
    AND EXISTS (SELECT 1 FROM ${table} WHERE id=? AND NOT (${CANCELLED_SQL}))`)
    .run(now,source,ref,state,now,ref);
}
