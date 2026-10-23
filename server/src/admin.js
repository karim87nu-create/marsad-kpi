'use strict';
const { sha256, randomToken, hashPassword, verifyPassword } = require('./security');

const ROLES = ['admin', 'supervisor', 'viewer'];
const SESSION_MS = 12 * 3600000;
const MASTER = { id: 0, name: 'الإدارة', role: 'admin' };

function setup(app) {
  const { db, fail } = app;
  const rawCache = new Map();

  function identityForPassword(password) {
    if (!password) return null;
    if (app.config.adminPasswordHash && verifyPassword(password, app.config.adminPasswordHash)) return MASTER;
    for (const a of db.prepare('SELECT * FROM admin_accounts WHERE deleted_at IS NULL AND active = 1').all())
      if (verifyPassword(password, a.password_hash)) return { id: a.id, name: a.name, role: a.role };
    return null;
  }

  function accountIdentity(id) {
    if (id === 0) return MASTER;
    const a = db.prepare('SELECT * FROM admin_accounts WHERE id = ? AND deleted_at IS NULL AND active = 1').get(id);
    return a ? { id: a.id, name: a.name, role: a.role } : null;
  }

  // x-admin-password carries a session token from /api/admin-access login; a raw
  // password is still accepted for older pages and is cached briefly by its hash.
  function resolve(ctx) {
    const value = ctx.header('x-admin-password');
    if (!value) return null;
    if (/^[a-f0-9]{64}$/.test(value)) {
      const s = db.prepare('SELECT * FROM admin_sessions WHERE token_hash = ?').get(sha256(value));
      if (s && !s.revoked_at && s.expires_at > ctx.now) return accountIdentity(s.account_id);
    }
    const key = sha256('raw:' + value), hit = rawCache.get(key);
    if (hit && hit.until > ctx.now) return accountIdentity(hit.identity.id);
    if (app.limiters.adminLogin.blocked(ctx.ip, ctx.now)) fail(429, 'محاولات كثيرة؛ انتظر 15 دقيقة');
    const identity = identityForPassword(value);
    if (!identity) { app.limiters.adminLogin.fail(ctx.ip, ctx.now); return null; }
    rawCache.set(key, { identity, until: ctx.now + 300000 });
    if (rawCache.size > 100) rawCache.delete(rawCache.keys().next().value);
    return identity;
  }

  // level: 'read' (any role), 'write' (admin or supervisor), 'admin'
  app.requireAdmin = (ctx, level = 'read') => {
    const who = resolve(ctx);
    if (!who) fail(401, 'كلمة المرور غير صحيحة أو انتهى الدخول');
    if (level === 'admin' && who.role !== 'admin') fail(403, 'هذا الإجراء لحساب المدير فقط');
    if (level === 'write' && !['admin', 'supervisor'].includes(who.role)) fail(403, 'هذا الحساب للعرض فقط');
    return who;
  };
  app.adminFromHeader = resolve;

  function passwordTaken(password, exceptId) {
    if (app.config.adminPasswordHash && verifyPassword(password, app.config.adminPasswordHash)) return true;
    return db.prepare('SELECT * FROM admin_accounts WHERE deleted_at IS NULL').all()
      .some(a => a.id !== exceptId && verifyPassword(password, a.password_hash));
  }

  function checkNewPassword(password, confirmation, exceptId) {
    if (typeof password !== 'string' || password.length < 6 || password.length > 200) fail(400, 'الباسورد لازم يكون 6 حروف أو أكثر');
    if (password !== confirmation) fail(400, 'تأكيد الباسورد غير مطابق');
    if (passwordTaken(password, exceptId)) fail(409, 'الباسورد مستخدم لحساب آخر؛ اختار باسورد مختلف');
  }

  const accounts = () => db.prepare('SELECT id, name, role, active FROM admin_accounts WHERE deleted_at IS NULL ORDER BY id')
    .all().map(a => ({ ...a, active: !!a.active }));

  app.route('GET', '/api/admin-access', ctx => {
    const who = app.requireAdmin(ctx);
    return { identity: who, ...(who.role === 'admin' ? { accounts: accounts() } : {}) };
  });

  app.route('POST', '/api/admin-access', ctx => {
    const b = ctx.body;
    if (b.action === 'login') {
      if (app.limiters.adminLogin.blocked(ctx.ip, ctx.now)) fail(429, 'محاولات كثيرة؛ انتظر 15 دقيقة');
      const who = typeof b.password === 'string' ? identityForPassword(b.password) : null;
      if (!who) { app.limiters.adminLogin.fail(ctx.ip, ctx.now); fail(401, 'كلمة مرور الإدارة غير صحيحة'); }
      app.limiters.adminLogin.reset(ctx.ip);
      const token = randomToken();
      db.prepare('INSERT INTO admin_sessions (token_hash, account_id, created_at, expires_at) VALUES (?,?,?,?)')
        .run(sha256(token), who.id, ctx.now, ctx.now + SESSION_MS);
      return { token, identity: who };
    }
    if (b.action === 'logout') {
      const value = ctx.header('x-admin-password');
      if (/^[a-f0-9]{64}$/.test(value)) db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(ctx.now, sha256(value));
      return { ok: true };
    }
    const who = app.requireAdmin(ctx, 'admin');
    const name = String(b.name || '').trim();
    if (!name || name.length > 100) fail(400, 'اكتب اسم المستخدم');
    if (!ROLES.includes(b.role)) fail(400, 'اختار دورًا صحيحًا');
    checkNewPassword(b.password, b.confirmation);
    const r = db.prepare('INSERT INTO admin_accounts (name, role, password_hash, created_at) VALUES (?,?,?,?)').run(name, b.role, hashPassword(b.password), ctx.now);
    app.audit('admin_account_created', null, { actor: who.name, accountId: r.lastInsertRowid, name, role: b.role });
    return { ok: true, id: r.lastInsertRowid };
  });

  app.route('PATCH', '/api/admin-access', ctx => {
    const who = app.requireAdmin(ctx, 'admin');
    const b = ctx.body, a = db.prepare('SELECT * FROM admin_accounts WHERE id = ? AND deleted_at IS NULL').get(Number(b.id));
    if (!a) fail(404, 'المستخدم غير موجود');
    const changes = {};
    if (b.role !== undefined) { if (!ROLES.includes(b.role)) fail(400, 'اختار دورًا صحيحًا'); changes.role = b.role; }
    if (b.active !== undefined) changes.active = b.active ? 1 : 0;
    if (b.password) { checkNewPassword(b.password, b.confirmation, a.id); changes.password_hash = hashPassword(b.password); }
    if (!Object.keys(changes).length) fail(400, 'لا يوجد تغيير');
    const set = Object.keys(changes).map(k => k + ' = @' + k).join(', ');
    db.prepare('UPDATE admin_accounts SET ' + set + ' WHERE id = @id').run({ ...changes, id: a.id });
    db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL').run(ctx.now, a.id);
    app.audit('admin_account_changed', null, { actor: who.name, accountId: a.id, role: changes.role, active: b.active, passwordChanged: !!b.password });
    return { ok: true };
  });

  app.route('DELETE', '/api/admin-access', ctx => {
    const who = app.requireAdmin(ctx, 'admin');
    const a = db.prepare('SELECT * FROM admin_accounts WHERE id = ? AND deleted_at IS NULL').get(Number(ctx.body.id));
    if (!a) fail(404, 'المستخدم غير موجود');
    db.prepare('UPDATE admin_accounts SET deleted_at = ?, active = 0 WHERE id = ?').run(ctx.now, a.id);
    db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL').run(ctx.now, a.id);
    app.audit('admin_account_deleted', null, { actor: who.name, accountId: a.id, name: a.name });
    return { ok: true };
  });
}

module.exports = { setup, MASTER };
