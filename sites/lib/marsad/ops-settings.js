// What used to need a publish (Karim 11-17: «مش عايزين ... نستني أيام عشان يتصلح»): the restaurant's hours and extra
// transfer rules are kept in settings and changed from the admin page. Read once a minute before a request runs.
import { RULES } from './time.js';
import { setExtraRules, norm } from './transfer-rules.js';
import { parseJson } from './order-match.js';

const DEFAULT = { openHour: RULES.openHour, closeHour: RULES.operatingEndHour };
const EVERY_MS = 60000;

function setup(app) {
  const { db, fail } = app;
  const setting = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;
  const put = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));

  const applyHours = h => { RULES.openHour = h.openHour; RULES.operatingEndHour = h.closeHour; };
  const validHours = h => {
    const openHour = Number(h?.openHour), closeHour = Number(h?.closeHour);
    // The data day starts at 9: the restaurant opens 9 ص – 6 م and closes midnight – 8 ص.
    if (!Number.isInteger(openHour) || openHour < RULES.businessStartHour || openHour > 18) return null;
    if (!Number.isInteger(closeHour) || closeHour < 0 || closeHour >= RULES.businessStartHour) return null;
    return { openHour, closeHour };
  };
  let readAt = -Infinity;
  async function load(now) {
    readAt = now;
    applyHours(validHours(parseJson(await setting('operating_hours'), null)) || DEFAULT);
    setExtraRules(parseJson(await setting('transfer_rules_extra'), null));
  }
  app.beforeRequest(async now => { if (now - readAt >= EVERY_MS) await load(now).catch(() => {}); });

  app.route('GET', '/api/ops-settings', async ctx => {
    await app.requireAdmin(ctx);
    return { hours: { openHour: RULES.openHour, closeHour: RULES.operatingEndHour }, defaults: DEFAULT, rules: setExtraRules(parseJson(await setting('transfer_rules_extra'), null)) };
  });
  app.route('PUT', '/api/ops-settings/hours', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const h = ctx.body?.reset ? DEFAULT : validHours(ctx.body);
    if (!h) fail(400, 'المواعيد مش مظبوطة: الفتح من 9 ص لـ 6 م والقفل من 12 بالليل لـ 8 الصبح');
    await put('operating_hours', h); applyHours(h);
    await app.audit?.('operating_hours', null, { actor: who.name, ...h });
    return { ok: true, hours: h };
  });
  // One rule added or removed at a time. kind 'area' { words, source, no, addAddress } | 'item' { name, no }.
  app.route('PUT', '/api/ops-settings/rules', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const b = ctx.body || {}, cur = setExtraRules(parseJson(await setting('transfer_rules_extra'), null));
    const list = b.kind === 'area' ? 'areas' : b.kind === 'item' ? 'items' : fail(400, 'اختار منطقة ولا صنف');
    const key = norm(b.kind === 'area' ? b.words : b.name);
    if (!key) fail(400, 'اكتب الكلام زي ما بيظهر في الأوردر');
    const same = r => (r.words || r.name) === key && (b.kind === 'item' || (r.source || null) === (b.source === 'talabat' || b.source === 'site' ? b.source : null));
    cur[list] = cur[list].filter(r => !same(r));
    if (!b.remove) {
      const before = cur[list].length;
      cur[list].unshift(b.kind === 'area' ? { words: key, source: b.source, no: b.no, addAddress: b.addAddress } : { name: key, no: b.no });
      if (setExtraRules(cur)[list].length === before) fail(400, b.kind === 'area' ? 'رقم المنطقة لازم يكون رقم' : 'رقم الصنف مش مظبوط');
      if (cur[list].length > 300) fail(400, 'القواعد كتير؛ امسح القديم الأول');
    }
    const saved = setExtraRules(cur);
    await put('transfer_rules_extra', saved);
    await app.audit?.('transfer_rule', null, { actor: who.name, kind: b.kind, key, no: b.no ?? null, remove: !!b.remove });
    return { ok: true, rules: saved };
  });
}

export { setup };
