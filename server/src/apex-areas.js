// One area written twice on Apex (Karim 11-14: «فيه مناطق ممكن تكون متكرر مرتين علي ابيكس مع انها نفس المنطقه زي مدينتي
// و مدنتي»). Read 11-14 from Apex: «مدينتي» 361 / «مدنتى» 370, «التجمع الخامس» 218 / «التجمع الخامس طلبات» 354,
// «المقطم» 234 / «المقطم..» 346, «مساكن الشروق» 165 / 305 … Two areas are the same when their names have the same letters
// once the spelling is set aside (ى/ي, ة/ه, «ال», the long vowels, dots, «طلبات») AND Apex charges the same delivery for
// both (so «سراي القبة» 38.50 and «سرايا القبة» 42.50 stay apart). Admin can keep two apart, or put two together.
import { normArabic } from './apex-customer-notes.js';

const DROP = new Set(['طلبات', 'talabat', 'جديد', 'new']);
export function areaKey(name) {
  const words = normArabic(String(name || '').replace(/[.\-–_/\\|,،:؛]+/g, ' ')).split(' ').filter(w => w && !DROP.has(w));
  // The first letter of each word stays (an «ا» or «و» that starts a word is part of it); the rest without ا و ي ه.
  const key = words.map(w => w.replace(/^(?:ال)(?=..)/, '')).map(w => w[0] + w.slice(1).replace(/[اويه]/g, '')).join('');
  return /[ء-ي]/.test(key) && key.replace(/\d/g, '').length >= 2 ? key : '';
}
const fee = l => l?.service == null || !Number.isFinite(Number(l.service)) ? 'x' : Number(l.service).toFixed(2);

// locations: [{ no, name, branch, service }] (a number may be listed once per branch). rules: { apart: [[a, b]], together: [[a, b]] }.
// → Map(no → group id); a number alone is its own group.
export function areaGroups(locations, rules = {}) {
  const byNo = new Map();
  for (const l of locations || []) { const no = Number(l?.no); if (Number.isInteger(no) && no > 0 && !byNo.has(no)) byNo.set(no, l); }
  const parent = new Map([...byNo.keys()].map(n => [n, n]));
  const find = n => { while (parent.get(n) !== n) n = parent.get(n); return n; };
  const apart = new Set((rules.apart || []).map(([a, b]) => [Number(a), Number(b)].sort((x, y) => x - y).join('|')));
  const join = (a, b) => { if (!parent.has(a) || !parent.has(b)) return; const x = find(a), y = find(b); if (x !== y) parent.set(Math.max(x, y), Math.min(x, y)); };
  const same = new Map();
  for (const [no, l] of byNo) { const k = areaKey(l.name); if (!k) continue; const id = k + '|' + fee(l); (same.get(id) || same.set(id, []).get(id)).push(no); }
  for (const nos of same.values()) for (let i = 1; i < nos.length; i++) if (!apart.has([nos[0], nos[i]].sort((x, y) => x - y).join('|'))) join(nos[0], nos[i]);
  for (const [a, b] of rules.together || []) join(Number(a), Number(b));
  return new Map([...byNo.keys()].map(n => [n, find(n)]));
}

// The groups with more than one area, for admin.
export function areaGroupList(locations, rules = {}) {
  const g = areaGroups(locations, rules), out = new Map();
  for (const l of locations || []) {
    const no = Number(l?.no); if (!g.has(no)) continue;
    const id = g.get(no), list = out.get(id) || out.set(id, []).get(id);
    if (!list.some(x => x.no === no)) list.push({ no, name: String(l.name || ''), service: l.service ?? null, branches: [] });
    const x = list.find(y => y.no === no); if (l.branch != null && !x.branches.includes(Number(l.branch))) x.branches.push(Number(l.branch));
  }
  return [...out.values()].filter(x => x.length > 1).map(x => x.sort((a, b) => a.no - b.no));
}

// Of an area's group, the one this branch serves (an area listed for another branch is not used for it).
export function areaForBranch(no, branch, locations, groups) {
  const owners = n => [...new Set((locations || []).filter(l => Number(l.no) === n).map(l => l.branch).filter(v => v != null).map(Number))];
  const serves = n => { const o = owners(n); return !o.length || !branch || o.includes(Number(branch)); };
  if (serves(no)) return no;
  const id = groups.get(Number(no));
  const alt = [...groups].filter(([n, g]) => g === id && n !== Number(no)).map(([n]) => n).filter(n => owners(n).includes(Number(branch)));
  return alt.length === 1 ? alt[0] : no;
}

// Admin: the areas Apex has twice, and keeping two apart / putting two together («apex_area_rules»).
import { parseJson } from './order-match.js';
function setup(app) {
  const { db, fail } = app;
  let cache = null, cacheAt = 0;
  const read = async () => parseJson((await db.prepare("SELECT value FROM settings WHERE key = 'apex_area_rules'").get())?.value, {}) || {};
  app.apexAreaRules = async () => {
    if (!cache || Date.now() - cacheAt > 60000) { const r = await read(); cache = { apart: Array.isArray(r.apart) ? r.apart : [], together: Array.isArray(r.together) ? r.together : [] }; cacheAt = Date.now(); }
    return cache;
  };
  const locations = async () => {
    const row = await db.prepare("SELECT data FROM orders_days WHERE data LIKE '%\"locations\"%' ORDER BY day DESC LIMIT 1").get();
    const list = parseJson(row?.data, {})?.locations;
    return Array.isArray(list) ? list : [];
  };
  app.route('GET', '/api/apex-areas', async ctx => {
    await app.requireAdmin(ctx);
    const rules = await app.apexAreaRules(), locs = await locations();
    const names = new Map(); for (const l of locs) if (!names.has(Number(l.no))) names.set(Number(l.no), String(l.name || ''));
    return { groups: areaGroupList(locs, rules), apart: rules.apart.map(([a, b]) => ({ a, b, aName: names.get(a) || '', bName: names.get(b) || '' })),
      together: rules.together.map(([a, b]) => ({ a, b, aName: names.get(a) || '', bName: names.get(b) || '' })),
      areas: [...names].map(([no, name]) => ({ no, name })).sort((x, y) => x.name.localeCompare(y.name, 'ar')) };
  });
  app.route('POST', '/api/apex-areas', async ctx => {
    const who = await app.requireAdmin(ctx, 'admin');
    const b = ctx.body || {}, a = Number(b.a), c = Number(b.b), act = b.action;
    if (!['apart', 'together', 'undo'].includes(act) || !Number.isInteger(a) || !Number.isInteger(c) || a <= 0 || c <= 0 || a === c) fail(400, 'اختار منطقتين مختلفتين');
    const r = await read(), pair = [Math.min(a, c), Math.max(a, c)], same = x => Number(x[0]) === pair[0] && Number(x[1]) === pair[1];
    const apart = (Array.isArray(r.apart) ? r.apart : []).filter(x => !same(x)), together = (Array.isArray(r.together) ? r.together : []).filter(x => !same(x));
    if (act === 'apart') apart.push(pair); if (act === 'together') together.push(pair);
    if (apart.length + together.length > 500) fail(400, 'too_many');
    await db.prepare("INSERT INTO settings (key, value) VALUES ('apex_area_rules', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify({ apart, together }));
    cache = null;
    await app.audit('apex_area_rules', null, { actor: who.name, action: act, a: pair[0], b: pair[1] });
    return { ok: true };
  });
}
export { setup };

// Karim 11-14 (website orders all went to «شارع الطاقة» while the address said «مكرم عبيد», «الحي العاشر», «الحديقة
// الدولية»): the website's area is one broad name for a branch, so the Apex area written in the customer's address is the
// better one. The longest Apex area name (of that branch) found in the address as whole words; nothing when two different
// areas match equally or none does. Names under 4 letters are not looked for.
const words = v => normArabic(String(v || '').replace(/[.\-–_/\\|,،:؛()]+/g, ' ')).replace(/[^\u0621-\u064a0-9 ]+/g, ' ').split(' ').filter(Boolean);
export function areaInAddress(address, locations, branch, groups) {
  const text = ' ' + words(address).join(' ') + ' ';
  if (text.trim().length < 3) return null;
  let best = null, tie = false;
  for (const l of locations || []) {
    const no = Number(l?.no); if (!Number.isInteger(no)) continue;
    if (branch != null && l.branch != null && Number(l.branch) !== Number(branch)) continue;
    const w = words(l.name).filter(x => x !== 'طلبات'); const name = w.join(' ');
    if (name.replace(/ /g, '').length < 4 || !text.includes(' ' + name + ' ')) continue;
    if (!best || name.length > best.len) { best = { no, len: name.length }; tie = false; }
    else if (name.length === best.len && (groups?.get(no) ?? no) !== (groups?.get(best.no) ?? best.no)) tie = true;
  }
  return best && !tie ? best.no : null;
}
