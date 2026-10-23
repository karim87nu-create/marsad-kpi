import { hashPassword, verifyPassword } from './security.js';

function setup(app) {
  const { db, fail } = app;
  const pinLookup = pin => app.signer.lookup('pin:' + pin);
  const shape = e => ({ id: e.id, name: e.name, employeeCode: e.employee_code, active: !!e.active && !e.deleted_at, hasPassword: !!(e.pin_hash || e.legacy_pin_hash) });
  const legacyRows = () => db.prepare('SELECT * FROM employees WHERE legacy_pin_hash IS NOT NULL AND deleted_at IS NULL').all();

  async function checkPin(pin, confirmation, exceptId) {
    if (typeof pin !== 'string' || !/^\d{1,32}$/.test(pin)) fail(400, 'اكتب باسورد أرقام؛ بدون طول محدد');
    if (pin !== confirmation) fail(400, 'password_confirmation_mismatch');
    const other = await db.prepare('SELECT id FROM employees WHERE pin_lookup = ? AND deleted_at IS NULL').get(pinLookup(pin));
    if (other && other.id !== exceptId) fail(409, 'password_in_use');
    // Imported old-system hashes have no lookup yet; compare against them too.
    for (const e of await legacyRows())
      if (e.id !== exceptId && await app.legacy.verify(pin, e.legacy_pin_hash)) fail(409, 'password_in_use');
  }

  const revokeSessions = (employeeId, reason, now) =>
    db.prepare('UPDATE employee_sessions SET revoked_at = ?, revoke_reason = ? WHERE employee_id = ? AND revoked_at IS NULL').bind(now, reason, employeeId);

  app.employeeByPin = async function employeeByPin(pin) {
    const e = await db.prepare('SELECT * FROM employees WHERE pin_lookup = ? AND deleted_at IS NULL').get(pinLookup(pin));
    if (e) return await verifyPassword(pin, e.pin_hash) ? e : null;
    // First login with an imported password: verify, then store it in the new format.
    const matches = [];
    for (const x of await legacyRows()) if (await app.legacy.verify(pin, x.legacy_pin_hash)) matches.push(x);
    if (matches.length > 1) fail(409, 'password_not_unique');
    if (!matches.length) return null;
    await db.prepare('UPDATE employees SET pin_hash = ?, pin_lookup = ?, legacy_pin_hash = NULL WHERE id = ?').run(await hashPassword(pin), pinLookup(pin), matches[0].id);
    return db.prepare('SELECT * FROM employees WHERE id = ?').get(matches[0].id);
  };

  app.route('GET', '/api/employees', async ctx => {
    await app.requireAdmin(ctx);
    const rows = await db.prepare('SELECT * FROM employees ORDER BY name COLLATE NOCASE').all();
    return {
      employees: rows.filter(e => !e.deleted_at).map(shape),
      archivedEmployees: rows.filter(e => e.deleted_at).map(e => ({ ...shape(e), active: false, historyOnly: true })),
    };
  });

  // Public probe used by the extension for availability and the server clock.
  app.route('GET', '/api/employees/list', async () => ({
    employees: await db.prepare('SELECT id FROM employees WHERE active = 1 AND deleted_at IS NULL').all(),
  }));

  app.route('POST', '/api/employees', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const name = String(ctx.body.name || '').trim(), code = String(ctx.body.employeeCode || '').trim();
    if (!name || !code || name.length > 100 || code.length > 40) fail(400, 'اكتب الاسم والكود وباسورد أرقام؛ بدون طول محدد');
    if (await db.prepare('SELECT 1 FROM employees WHERE employee_code = ? AND deleted_at IS NULL').get(code)) fail(409, 'employee_code_exists');
    await checkPin(ctx.body.pin, ctx.body.pinConfirmation);
    let r;
    try {
      r = await db.prepare('INSERT INTO employees (name, employee_code, pin_hash, pin_lookup, created_at) VALUES (?,?,?,?,?)')
        .run(name, code, await hashPassword(ctx.body.pin), pinLookup(ctx.body.pin), ctx.now);
    } catch (e) { if (/UNIQUE/i.test(String(e.message))) fail(409, 'employee_code_exists'); throw e; }
    await app.audit('employee_created', r.lastInsertRowid, { actor: who.name, name, employeeCode: code });
    return { ok: true, id: r.lastInsertRowid };
  });

  app.route('PATCH', '/api/employees', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const e = await db.prepare('SELECT * FROM employees WHERE id = ? AND deleted_at IS NULL').get(Number(ctx.body.id));
    if (!e) fail(404, 'الموظف غير موجود');
    const b = ctx.body, writes = [];
    if (b.pin !== undefined) {
      await checkPin(b.pin, b.pinConfirmation, e.id);
      writes.push(db.prepare('UPDATE employees SET pin_hash = ?, pin_lookup = ?, legacy_pin_hash = NULL WHERE id = ?').bind(await hashPassword(b.pin), pinLookup(b.pin), e.id),
        revokeSessions(e.id, 'password_changed', ctx.now));
    }
    if (b.active !== undefined) {
      writes.push(db.prepare('UPDATE employees SET active = ? WHERE id = ?').bind(b.active ? 1 : 0, e.id));
      if (!b.active) writes.push(revokeSessions(e.id, 'employee_disabled', ctx.now));
    }
    await db.batch(writes);
    await app.audit('employee_changed', e.id, { actor: who.name, name: e.name, employeeCode: e.employee_code, active: b.active, passwordChanged: b.pin !== undefined });
    return { ok: true };
  });

  app.route('DELETE', '/api/employees', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const e = await db.prepare('SELECT * FROM employees WHERE id = ? AND deleted_at IS NULL').get(Number(ctx.body.id));
    if (!e) fail(404, 'الموظف غير موجود');
    if (String(ctx.body.confirmCode) !== e.employee_code) fail(400, 'الكود غير مطابق؛ لم يتم الحذف');
    // History stays; the account can no longer log in and its code becomes reusable.
    await db.batch([
      db.prepare('UPDATE employees SET deleted_at = ?, active = 0, pin_hash = NULL, pin_lookup = NULL, legacy_pin_hash = NULL WHERE id = ?').bind(ctx.now, e.id),
      revokeSessions(e.id, 'employee_deleted', ctx.now),
      db.prepare('DELETE FROM message_recipients WHERE employee_id = ?').bind(e.id),
    ]);
    await app.audit('employee_deleted', e.id, { actor: who.name, name: e.name, employeeCode: e.employee_code });
    return { ok: true };
  });
}

export { setup };
