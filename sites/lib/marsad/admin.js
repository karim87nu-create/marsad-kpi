import { sha256, randomToken, hashPassword, verifyPassword } from './security.js';

const ROLES = ['admin', 'supervisor', 'viewer'];
const SESSION_MS = 12 * 3600000;
const MASTER = { id: 0, name: 'الإدارة', role: 'admin' };

function setup(app) {
  const { db, fail } = app;
  const rawCache = new Map();

  // The main password: from the configuration, or chosen once on first use (kept in settings).
  async function masterHash() {
    if (!app.config.adminPasswordHash) app.config.adminPasswordHash = (await db.prepare("SELECT value FROM settings WHERE key = 'admin_hash'").get())?.value || null;
    return app.config.adminPasswordHash;
  }

  async function identityForPassword(password) {
    if (!password) return null;
    const master = await masterHash();
    if (master && await verifyPassword(password, master)) return MASTER;
    for (const a of await db.prepare('SELECT * FROM admin_accounts WHERE deleted_at IS NULL AND active = 1').all()) {
      if (await verifyPassword(password, a.password_hash)) return { id: a.id, name: a.name, role: a.role };
      if (await app.legacy.verifyAdmin(password, a.password_hash)) {
        await db.prepare('UPDATE admin_accounts SET password_hash = ? WHERE id = ?').run(await hashPassword(password), a.id);
        return { id: a.id, name: a.name, role: a.role };
      }
    }
    return null;
  }

  async function accountIdentity(id) {
    if (id === 0) return MASTER;
    const a = await db.prepare('SELECT * FROM admin_accounts WHERE id = ? AND deleted_at IS NULL AND active = 1').get(id);
    return a ? { id: a.id, name: a.name, role: a.role } : null;
  }

  // x-admin-password carries a session token from /api/admin-access login; a raw
  // password is still accepted for older pages and is cached briefly by its hash.
  async function resolve(ctx) {
    const value = ctx.header('x-admin-password');
    if (!value) return null;
    if (/^[a-f0-9]{64}$/.test(value)) {
      const s = await db.prepare('SELECT * FROM admin_sessions WHERE token_hash = ?').get(sha256(value));
      if (s && !s.revoked_at && s.expires_at > ctx.now) return accountIdentity(s.account_id);
    }
    const key = sha256('raw:' + value), hit = rawCache.get(key);
    if (hit && hit.until > ctx.now) return accountIdentity(hit.identity.id);
    if (app.limiters.adminLogin.blocked(ctx.ip, ctx.now)) fail(429, 'محاولات كثيرة؛ انتظر 15 دقيقة');
    const identity = await identityForPassword(value);
    if (!identity) { app.limiters.adminLogin.fail(ctx.ip, ctx.now); return null; }
    rawCache.set(key, { identity, until: ctx.now + 300000 });
    if (rawCache.size > 100) rawCache.delete(rawCache.keys().next().value);
    return identity;
  }

  // level: 'read' (any role), 'write' (admin or supervisor), 'admin'
  app.requireAdmin = async (ctx, level = 'read') => {
    const who = await resolve(ctx);
    if (!who) fail(401, 'كلمة المرور غير صحيحة أو انتهى الدخول');
    if (level === 'admin' && who.role !== 'admin') fail(403, 'هذا الإجراء لحساب المدير فقط');
    if (level === 'write' && !['admin', 'supervisor'].includes(who.role)) fail(403, 'هذا الحساب للعرض فقط');
    return who;
  };
  app.adminFromHeader = resolve;

  async function passwordTaken(password, exceptId) {
    const master = await masterHash();
    if (master && await verifyPassword(password, master)) return true;
    for (const a of await db.prepare('SELECT * FROM admin_accounts WHERE deleted_at IS NULL').all())
      if (a.id !== exceptId && (await verifyPassword(password, a.password_hash) || await app.legacy.verifyAdmin(password, a.password_hash))) return true;
    return false;
  }

  async function checkNewPassword(password, confirmation, exceptId) {
    if (typeof password !== 'string' || password.length < 6 || password.length > 200) fail(400, 'الباسورد لازم يكون 6 حروف أو أكثر');
    if (password !== confirmation) fail(400, 'تأكيد الباسورد غير مطابق');
    if (await passwordTaken(password, exceptId)) fail(409, 'الباسورد مستخدم لحساب آخر؛ اختار باسورد مختلف');
  }

  const accounts = async () => (await db.prepare('SELECT id, name, role, active FROM admin_accounts WHERE deleted_at IS NULL ORDER BY id')
    .all()).map(a => ({ ...a, active: !!a.active }));

  app.route('GET', '/api/admin-access', async ctx => {
    const who = await app.requireAdmin(ctx);
    return { identity: who, ...(who.role === 'admin' ? { accounts: await accounts() } : {}) };
  });

  // First use of a new server: nobody can sign in until the main password is chosen here (once).
  app.route('GET', '/api/admin-access/setup', async () => ({ needed: !await masterHash() }));

  app.route('POST', '/api/admin-access', async ctx => {
    const b = ctx.body;
    if (b.action === 'setup') {
      if (await masterHash()) fail(409, 'كلمة المرور الرئيسية متحددة بالفعل');
      // Only a truly empty server may be set up from the page; a server with data needs MARSAD_ADMIN_PASSWORD.
      if ((await db.prepare('SELECT COUNT(*) n FROM employees').get()).n || (await db.prepare('SELECT COUNT(*) n FROM admin_accounts').get()).n)
        fail(409, 'السيرفر فيه بيانات؛ كلمة المرور الرئيسية لازم تتحدد من إعدادات السيرفر (MARSAD_ADMIN_PASSWORD)');
      if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 200) fail(400, 'كلمة المرور لازم تكون 8 حروف أو أكثر');
      if (b.password !== b.confirmation) fail(400, 'تأكيد كلمة المرور غير مطابق');
      for (const a of await db.prepare('SELECT * FROM admin_accounts WHERE deleted_at IS NULL').all())
        if (await verifyPassword(b.password, a.password_hash) || await app.legacy.verifyAdmin(b.password, a.password_hash)) fail(409, 'الباسورد مستخدم لحساب آخر؛ اختار باسورد مختلف');
      const r = await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_hash', ?)").run(await hashPassword(b.password));
      if (!r.changes) fail(409, 'كلمة المرور الرئيسية متحددة بالفعل');
      app.config.adminPasswordHash = null;
      await app.audit('master_password_set', null, { actor: 'الإدارة' });
      const token = randomToken();
      await db.prepare('INSERT INTO admin_sessions (token_hash, account_id, created_at, expires_at) VALUES (?,?,?,?)').run(sha256(token), 0, ctx.now, ctx.now + SESSION_MS);
      return { token, identity: MASTER };
    }
    if (b.action === 'login') {
      if (app.limiters.adminLogin.blocked(ctx.ip, ctx.now)) fail(429, 'محاولات كثيرة؛ انتظر 15 دقيقة');
      const who = typeof b.password === 'string' ? await identityForPassword(b.password) : null;
      if (!who) { app.limiters.adminLogin.fail(ctx.ip, ctx.now); fail(401, 'كلمة مرور الإدارة غير صحيحة'); }
      app.limiters.adminLogin.reset(ctx.ip);
      const token = randomToken();
      await db.prepare('INSERT INTO admin_sessions (token_hash, account_id, created_at, expires_at) VALUES (?,?,?,?)')
        .run(sha256(token), who.id, ctx.now, ctx.now + SESSION_MS);
      return { token, identity: who };
    }
    if (b.action === 'logout') {
      const value = ctx.header('x-admin-password');
      if (/^[a-f0-9]{64}$/.test(value)) await db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(ctx.now, sha256(value));
      return { ok: true };
    }
    const who = await app.requireAdmin(ctx, 'admin');
    const name = String(b.name || '').trim();
    if (!name || name.length > 100) fail(400, 'اكتب اسم المستخدم');
    if (!ROLES.includes(b.role)) fail(400, 'اختار دورًا صحيحًا');
    await checkNewPassword(b.password, b.confirmation);
    const r = await db.prepare('INSERT INTO admin_accounts (name, role, password_hash, created_at) VALUES (?,?,?,?)').run(name, b.role, await hashPassword(b.password), ctx.now);
    await app.audit('admin_account_created', null, { actor: who.name, accountId: r.lastInsertRowid, name, role: b.role });
    return { ok: true, id: r.lastInsertRowid };
  });

  app.route('PATCH', '/api/admin-access', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const b = ctx.body, a = await db.prepare('SELECT * FROM admin_accounts WHERE id = ? AND deleted_at IS NULL').get(Number(b.id));
    if (!a) fail(404, 'المستخدم غير موجود');
    const changes = {};
    if (b.role !== undefined) { if (!ROLES.includes(b.role)) fail(400, 'اختار دورًا صحيحًا'); changes.role = b.role; }
    if (b.active !== undefined) { if (!b.active && a.id === who.id) fail(400, 'مينفعش توقف حسابك انت'); changes.active = b.active ? 1 : 0; }
    if (b.password) { await checkNewPassword(b.password, b.confirmation, a.id); changes.password_hash = await hashPassword(b.password); }
    if (!Object.keys(changes).length) fail(400, 'لا يوجد تغيير');
    const keys = Object.keys(changes);
    await db.batch([
      db.prepare('UPDATE admin_accounts SET ' + keys.map(k => k + ' = ?').join(', ') + ' WHERE id = ?').bind(...keys.map(k => changes[k]), a.id),
      db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL').bind(ctx.now, a.id),
    ]);
    await app.audit('admin_account_changed', null, { actor: who.name, accountId: a.id, role: changes.role, active: b.active, passwordChanged: !!b.password });
    return { ok: true };
  });

  // Nothing is deleted: an admin account is stopped (active = 0) instead.
  app.route('DELETE', '/api/admin-access', async ctx => {
    await app.requireAdmin(ctx, 'admin');
    fail(409, 'الحذف متوقف عشان مفيش بيانات تضيع؛ استخدم «إيقاف» بدلها');
  });
}

export { setup, MASTER };
