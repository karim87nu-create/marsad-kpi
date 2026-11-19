// What used to need a publish (Karim 11-17: «مش عايزين ... نستني أيام عشان يتصلح»): the restaurant's hours and extra
// transfer rules are kept in settings and changed from the admin page. Read once a minute before a request runs.
import { RULES } from './time.js';
import { setExtraRules, norm } from './transfer-rules.js';
import { parseJson } from './order-match.js';
import { TUNE_DEFS, TUNE_LISTS, TUNE_PAIR_LISTS, applyTune, tuneWord } from './tune.js';

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
    applyTune(parseJson(await setting('tune'), null));
  }
  app.beforeRequest(async now => { if (now - readAt >= EVERY_MS) await load(now).catch(() => {}); });

  app.route('GET', '/api/ops-settings', async ctx => {
    await app.requireAdmin(ctx);
    const t = applyTune(parseJson(await setting('tune'), null));
    return { hours: { openHour: RULES.openHour, closeHour: RULES.operatingEndHour }, defaults: DEFAULT, rules: setExtraRules(parseJson(await setting('transfer_rules_extra'), null)),
      tune: { defs: TUNE_DEFS, lists: TUNE_LISTS, pairLists: TUNE_PAIR_LISTS, values: t.values, words: t.words, pairs: t.pairs } };
  });
  // One number or one word at a time: { key, value } | { key, reset: true } | { list, word, remove? }.
  app.route('PUT', '/api/ops-settings/tune', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const b = ctx.body || {}, cur = applyTune(parseJson(await setting('tune'), null));
    let what;
    if (b.pairs) {
      if (!TUNE_PAIR_LISTS.some(l => l.key === b.pairs)) fail(400, 'قايمة مش معروفة');
      const from = String(b.from || '').replace(/\s+/g, ' ').trim(), to = String(b.to || '').replace(/\s+/g, ' ').trim();
      if (from.length < 2) fail(400, 'اكتب الكلام اللي يتغيّر');
      cur.pairs[b.pairs] = cur.pairs[b.pairs].filter(x => tuneWord(x.from) !== tuneWord(from));
      if (!b.remove) cur.pairs[b.pairs].unshift({ from, to });
      what = { pairs: b.pairs, from, to, remove: !!b.remove };
    } else if (b.list) {
      if (!TUNE_LISTS.some(l => l.key === b.list)) fail(400, 'قايمة مش معروفة');
      const w = tuneWord(b.word); if (w.length < 2) fail(400, 'اكتب الكلمة');
      cur.words[b.list] = cur.words[b.list].filter(x => x !== w);
      if (!b.remove) { cur.words[b.list].unshift(w); if (cur.words[b.list].length > 500) fail(400, 'القايمة كبيرة؛ امسح القديم الأول'); }
      what = { list: b.list, word: w, remove: !!b.remove };
    } else {
      const d = TUNE_DEFS.find(x => x.key === b.key); if (!d) fail(400, 'إعداد مش معروف');
      const v = b.reset ? d.def : Number(b.value);
      if (!Number.isInteger(v) || v < d.min || v > d.max) fail(400, 'الرقم لازم يكون من ' + d.min + ' لـ ' + d.max);
      cur.values[d.key] = v; what = { key: d.key, value: v };
    }
    const saved = applyTune(cur);
    await put('tune', saved);
    await app.audit?.('tune', null, { actor: who.name, ...what });
    return { ok: true, values: saved.values, words: saved.words, pairs: saved.pairs };
  });
  // The cashier PC asks for the word lists (every 10 minutes).
  app.route('POST', '/api/apex-writer/note-rules', async ctx => {
    await app.apexWriterAuth(ctx);
    return applyTune(parseJson(await setting('tune'), null)).words;
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
