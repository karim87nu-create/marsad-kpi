// أقسام الأونلاين: the same employees sign in over the Talabat Partner Hub and the website screens, each desk with
// its own password. Sessions say who was working on which screen, so platform activity is attributed to a person.
// Also: each Apex user name is tied to one employee, so order reports use the Marsad name.
import { hashPassword, verifyPassword } from './security.js';

const DESKS = { talabat: 'طلبات', site: 'الموقع' };
const SESSION_MS = 18 * 3600000, STALE_MS = 3 * 60000;

function setup(app) {
  const { db, fail } = app;
  const lookup = (desk, pin) => app.signer.lookup('desk:' + desk + ':' + pin);
  const checkDesk = d => { if (!DESKS[d]) fail(400, 'invalid_desk'); return d; };
  const checkDevice = ctx => {
    const token = ctx.header('x-device-token');
    if (!token || !app.config.deviceTokens.includes(token)) fail(403, 'invalid_device');
  };

  // ---- passwords (admin) ----
  app.route('PATCH', '/api/desks/pin', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const b = ctx.body, desk = checkDesk(b.desk);
    const e = await db.prepare('SELECT * FROM employees WHERE id = ? AND deleted_at IS NULL').get(Number(b.employeeId));
    if (!e) fail(404, 'الموظف غير موجود');
    if (b.pin === null) {
      await db.batch([db.prepare('DELETE FROM desk_pins WHERE employee_id = ? AND desk = ?').bind(e.id, desk),
        db.prepare("UPDATE desk_sessions SET ended_at = ?, end_reason = 'password_removed' WHERE employee_id = ? AND desk = ? AND ended_at IS NULL").bind(ctx.now, e.id, desk)]);
      await app.audit('desk_pin_removed', e.id, { actor: who.name, desk });
      return { ok: true };
    }
    if (typeof b.pin !== 'string' || !/^\d{1,32}$/.test(b.pin)) fail(400, 'اكتب باسورد أرقام؛ بدون طول محدد');
    if (b.pin !== b.pinConfirmation) fail(400, 'password_confirmation_mismatch');
    const other = await db.prepare('SELECT employee_id FROM desk_pins WHERE desk = ? AND pin_lookup = ?').get(desk, lookup(desk, b.pin));
    if (other && other.employee_id !== e.id) fail(409, 'password_in_use');
    await db.batch([
      db.prepare('INSERT INTO desk_pins (employee_id, desk, pin_hash, pin_lookup, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(employee_id, desk) DO UPDATE SET pin_hash = excluded.pin_hash, pin_lookup = excluded.pin_lookup, updated_at = excluded.updated_at')
        .bind(e.id, desk, await hashPassword(b.pin), lookup(desk, b.pin), ctx.now),
      db.prepare("UPDATE desk_sessions SET ended_at = ?, end_reason = 'password_changed' WHERE employee_id = ? AND desk = ? AND ended_at IS NULL").bind(ctx.now, e.id, desk)]);
    await app.audit('desk_pin_set', e.id, { actor: who.name, name: e.name, desk });
    return { ok: true };
  });

  // ---- the gate over the platform screens (extension) ----
  app.route('POST', '/api/desks/login', async ctx => {
    checkDevice(ctx);
    const desk = checkDesk(ctx.body.desk), pin = ctx.body.pin;
    if (typeof pin !== 'string' || !/^\d{1,32}$/.test(pin)) fail(400, 'invalid_fields');
    const key = 'desk|' + ctx.ip;
    if (app.limiters.employeeLogin.blocked(key, ctx.now)) fail(429, 'rate_limited');
    const row = await db.prepare('SELECT p.*, e.name, e.active, e.deleted_at FROM desk_pins p JOIN employees e ON e.id = p.employee_id WHERE p.desk = ? AND p.pin_lookup = ?').get(desk, lookup(desk, pin));
    if (!row || !row.active || row.deleted_at || !await verifyPassword(pin, row.pin_hash)) { app.limiters.employeeLogin.fail(key, ctx.now); fail(401, 'invalid_password'); }
    app.limiters.employeeLogin.reset(key);
    const device = String(ctx.body.device || '').slice(0, 80), place = String(ctx.body.place || '').slice(0, 120);
    // One open session per screen: the same browser signing in again replaces its own session.
    await db.prepare("UPDATE desk_sessions SET ended_at = ?, end_reason = 'replaced' WHERE desk = ? AND device = ? AND ended_at IS NULL").run(ctx.now, desk, device);
    const r = await db.prepare('INSERT INTO desk_sessions (employee_id, desk, device, place, started_at, last_seen) VALUES (?,?,?,?,?,?)').run(row.employee_id, desk, device, place, ctx.now, ctx.now);
    const token = app.signer.sign({ dsid: Number(r.lastInsertRowid), eid: row.employee_id, desk, iat: ctx.now, exp: ctx.now + SESSION_MS });
    await app.audit('desk_login', row.employee_id, { desk, place });
    return { token, employee: { id: row.employee_id, name: row.name }, desk, deskName: DESKS[desk], serverNow: new Date(ctx.now).toISOString() };
  });
  async function deskSession(ctx) {
    checkDevice(ctx);
    const c = app.signer.verify(ctx.header('x-desk-session'));
    if (!c || !Number.isInteger(c.dsid) || c.exp <= ctx.now) fail(401, 'invalid_desk_session');
    const s = await db.prepare('SELECT * FROM desk_sessions WHERE id = ?').get(c.dsid);
    if (!s || s.ended_at) fail(401, 'invalid_desk_session');
    return s;
  }
  app.deskSession = deskSession;
  app.route('POST', '/api/desks/beat', async ctx => {
    const s = await deskSession(ctx);
    const place = ctx.body?.place ? String(ctx.body.place).slice(0, 120) : s.place;
    await db.prepare('UPDATE desk_sessions SET last_seen = ?, place = ? WHERE id = ?').run(ctx.now, place, s.id);
    return { ok: true, serverNow: new Date(ctx.now).toISOString() };
  });
  app.route('POST', '/api/desks/logout', async ctx => {
    const s = await deskSession(ctx);
    await db.prepare('UPDATE desk_sessions SET ended_at = ?, end_reason = ? WHERE id = ?').run(ctx.now, String(ctx.body?.reason || 'logout').slice(0, 40), s.id);
    return { ok: true };
  });

  // ---- the admin view: who has which desk password, who is on a desk now, Apex names ----
  app.route('GET', '/api/desks', async ctx => {
    await app.requireAdmin(ctx);
    const pins = await db.prepare('SELECT employee_id, desk FROM desk_pins').all();
    const since = ctx.now - SESSION_MS;
    const sessions = (await db.prepare('SELECT s.*, e.name FROM desk_sessions s JOIN employees e ON e.id = s.employee_id WHERE s.started_at >= ? ORDER BY s.started_at DESC LIMIT 300').all(since))
      .map(s => ({ id: s.id, employeeId: s.employee_id, name: s.name, desk: s.desk, deskName: DESKS[s.desk], place: s.place, startedAt: new Date(s.started_at).toISOString(),
        lastSeen: new Date(s.last_seen).toISOString(), endedAt: s.ended_at ? new Date(s.ended_at).toISOString() : null, endReason: s.end_reason,
        live: !s.ended_at && ctx.now - s.last_seen < STALE_MS }));
    const map = await db.prepare('SELECT apex_name, employee_id FROM apex_names').all();
    // Apex names the monitor has seen (its user list, and anyone who entered or cancelled an order lately).
    const seen = new Set(map.map(m => m.apex_name));
    for (const r of await db.prepare('SELECT data FROM orders_days ORDER BY received_at DESC LIMIT 7').all()) {
      let d = null; try { d = JSON.parse(r.data); } catch {}
      for (const n of [...(d?.users || []), ...(d?.staff || []).map(s => s.name), ...(d?.cancels || []).flatMap(c => [c.user, c.by])]) if (n && !/^#\d+$/.test(n)) seen.add(String(n));
    }
    return { desks: DESKS, pins: pins.map(p => ({ employeeId: p.employee_id, desk: p.desk })), sessions,
      apexNames: map.map(m => ({ apexName: m.apex_name, employeeId: m.employee_id })), apexSeen: [...seen].sort((a, b) => a.localeCompare(b, 'ar')) };
  });
  app.route('PUT', '/api/apex-names', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const name = String(ctx.body.apexName || '').trim().slice(0, 100), id = ctx.body.employeeId == null ? null : Number(ctx.body.employeeId);
    if (!name) fail(400, 'اختار الاسم في Apex');
    // One Apex name belongs to one employee; an employee can have more than one Apex name.
    if (id == null) await db.prepare('DELETE FROM apex_names WHERE apex_name = ?').run(name);
    else {
      if (!await db.prepare('SELECT 1 FROM employees WHERE id = ? AND deleted_at IS NULL').get(id)) fail(404, 'الموظف غير موجود');
      await db.prepare('INSERT INTO apex_names (apex_name, employee_id, set_at) VALUES (?,?,?) ON CONFLICT(apex_name) DO UPDATE SET employee_id = excluded.employee_id, set_at = excluded.set_at').run(name, id, ctx.now);
    }
    await app.audit('apex_name_set', id, { actor: who.name, apexName: name });
    return { ok: true };
  });
  // Apex name -> Marsad name, for the order reports.
  app.apexNameMap = async () => Object.fromEntries((await db.prepare('SELECT a.apex_name, e.name FROM apex_names a JOIN employees e ON e.id = a.employee_id').all()).map(r => [r.apex_name, r.name]));
}

export { setup, DESKS };
