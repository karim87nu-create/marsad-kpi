'use strict';
const { hashPassword, verifyPassword } = require('./security');

function setup(app) {
  const { db, fail } = app;
  const pinLookup = pin => app.signer.lookup('pin:' + pin);
  const shape = e => ({ id: e.id, name: e.name, employeeCode: e.employee_code, active: !!e.active && !e.deleted_at, hasPassword: !!(e.pin_hash || e.legacy_pin_hash) });

  function checkPin(pin, confirmation, exceptId) {
    if (typeof pin !== 'string' || !/^\d{1,32}$/.test(pin)) fail(400, 'اكتب باسورد أرقام؛ بدون طول محدد');
    if (pin !== confirmation) fail(400, 'password_confirmation_mismatch');
    const other = db.prepare('SELECT id FROM employees WHERE pin_lookup = ? AND deleted_at IS NULL').get(pinLookup(pin));
    if (other && other.id !== exceptId) fail(409, 'password_in_use');
    // Imported old-system hashes have no lookup yet; compare against them too.
    for (const e of db.prepare('SELECT id, legacy_pin_hash FROM employees WHERE legacy_pin_hash IS NOT NULL AND deleted_at IS NULL').all())
      if (e.id !== exceptId && app.legacy && app.legacy.verify(pin, e.legacy_pin_hash)) fail(409, 'password_in_use');
  }

  const revokeSessions = (employeeId, reason, now) =>
    db.prepare('UPDATE employee_sessions SET revoked_at = ?, revoke_reason = ? WHERE employee_id = ? AND revoked_at IS NULL').run(now, reason, employeeId);

  app.employeeByPin = function employeeByPin(pin) {
    const e = db.prepare('SELECT * FROM employees WHERE pin_lookup = ? AND deleted_at IS NULL').get(pinLookup(pin));
    if (e) return verifyPassword(pin, e.pin_hash) ? e : null;
    // First login with an imported password: verify, then store it in the new format.
    const matches = app.legacy ? db.prepare('SELECT * FROM employees WHERE legacy_pin_hash IS NOT NULL AND deleted_at IS NULL').all()
      .filter(x => app.legacy.verify(pin, x.legacy_pin_hash)) : [];
    if (matches.length > 1) fail(409, 'password_not_unique');
    if (!matches.length) return null;
    db.prepare('UPDATE employees SET pin_hash = ?, pin_lookup = ?, legacy_pin_hash = NULL WHERE id = ?').run(hashPassword(pin), pinLookup(pin), matches[0].id);
    return db.prepare('SELECT * FROM employees WHERE id = ?').get(matches[0].id);
  };

  app.route('GET', '/api/employees', ctx => {
    app.requireAdmin(ctx);
    const rows = db.prepare('SELECT * FROM employees ORDER BY name COLLATE NOCASE').all();
    return {
      employees: rows.filter(e => !e.deleted_at).map(shape),
      archivedEmployees: rows.filter(e => e.deleted_at).map(e => ({ ...shape(e), active: false, historyOnly: true })),
    };
  });

  // Public probe used by the extension for availability and the server clock.
  app.route('GET', '/api/employees/list', () => ({
    employees: db.prepare('SELECT id FROM employees WHERE active = 1 AND deleted_at IS NULL').all(),
  }));

  app.route('POST', '/api/employees', ctx => {
    const who = app.requireAdmin(ctx, 'admin');
    const name = String(ctx.body.name || '').trim(), code = String(ctx.body.employeeCode || '').trim();
    if (!name || !code || name.length > 100 || code.length > 40) fail(400, 'اكتب الاسم والكود وباسورد أرقام؛ بدون طول محدد');
    if (db.prepare('SELECT 1 FROM employees WHERE employee_code = ? AND deleted_at IS NULL').get(code)) fail(409, 'employee_code_exists');
    checkPin(ctx.body.pin, ctx.body.pinConfirmation);
    const r = db.prepare('INSERT INTO employees (name, employee_code, pin_hash, pin_lookup, created_at) VALUES (?,?,?,?,?)')
      .run(name, code, hashPassword(ctx.body.pin), pinLookup(ctx.body.pin), ctx.now);
    app.audit('employee_created', r.lastInsertRowid, { actor: who.name, name, employeeCode: code });
    return { ok: true, id: r.lastInsertRowid };
  });

  app.route('PATCH', '/api/employees', ctx => {
    const who = app.requireAdmin(ctx, 'admin');
    const e = db.prepare('SELECT * FROM employees WHERE id = ? AND deleted_at IS NULL').get(Number(ctx.body.id));
    if (!e) fail(404, 'الموظف غير موجود');
    const b = ctx.body, tx = db.transaction(() => {
      if (b.pin !== undefined) {
        checkPin(b.pin, b.pinConfirmation, e.id);
        db.prepare('UPDATE employees SET pin_hash = ?, pin_lookup = ?, legacy_pin_hash = NULL WHERE id = ?').run(hashPassword(b.pin), pinLookup(b.pin), e.id);
        revokeSessions(e.id, 'password_changed', ctx.now);
      }
      if (b.active !== undefined) {
        db.prepare('UPDATE employees SET active = ? WHERE id = ?').run(b.active ? 1 : 0, e.id);
        if (!b.active) revokeSessions(e.id, 'employee_disabled', ctx.now);
      }
    });
    tx();
    app.audit('employee_changed', e.id, { actor: who.name, name: e.name, employeeCode: e.employee_code, active: b.active, passwordChanged: b.pin !== undefined });
    return { ok: true };
  });

  app.route('DELETE', '/api/employees', ctx => {
    const who = app.requireAdmin(ctx, 'admin');
    const e = db.prepare('SELECT * FROM employees WHERE id = ? AND deleted_at IS NULL').get(Number(ctx.body.id));
    if (!e) fail(404, 'الموظف غير موجود');
    if (String(ctx.body.confirmCode) !== e.employee_code) fail(400, 'الكود غير مطابق؛ لم يتم الحذف');
    db.transaction(() => {
      // History stays; the account can no longer log in and its code becomes reusable.
      db.prepare('UPDATE employees SET deleted_at = ?, active = 0, pin_hash = NULL, pin_lookup = NULL, legacy_pin_hash = NULL WHERE id = ?').run(ctx.now, e.id);
      revokeSessions(e.id, 'employee_deleted', ctx.now);
      db.prepare('DELETE FROM message_recipients WHERE employee_id = ?').run(e.id);
    })();
    app.audit('employee_deleted', e.id, { actor: who.name, name: e.name, employeeCode: e.employee_code });
    return { ok: true };
  });
}

module.exports = { setup };
