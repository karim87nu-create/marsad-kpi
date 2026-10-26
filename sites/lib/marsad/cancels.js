// الإلغاءات: on whom each cancellation is. Every cancellation of the day (Apex orders deleted after the pilot took
// them, and Talabat cancellations) gets a suggestion with its evidence:
//   - the employee who entered it: the dish on Apex was not what the customer ordered, or it was entered late;
//   - the branch: an item not available, the order late leaving the branch, a cancellation Talabat put on the restaurant;
//   - the pilot (ours or Talabat's), the customer, Talabat, or another reason.
// A supervisor confirms it or picks another from the admin page; each answer teaches which owner that reason usually
// means, so the next cancellation with the same reason is suggested from what was answered (2 answers and up).
import { businessDay, iso, validDate } from './time.js';

const OWNERS = { employee: 'الموظف اللي ضربه', branch: 'الفرع', pilot: 'الطيار', customer: 'العميل', platform: 'طلبات / المنصة', other: 'سبب تاني' };
const LATE_ENTRY_MIN = 10, LATE_OUT_MIN = 45;
const norm = s => String(s || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ًٌٍَُِّْ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const reasonKey = s => norm(s).split(' ').filter(w => w.length > 1).slice(0, 8).join(' ') || null;
const RULES = [
  [/غلط|خطا|خطأ|wrong|غير المطلوب|مش المطلوب|اتضرب|بدل|تبديل|incorrect|missing item/, 'employee', 'السبب بيقول إن الأوردر اتضرب غلط'],
  [/مش متوفر|غير متوفر|خلص|نفذ|ناقص|out of stock|unavailable|not available/, 'branch', 'صنف مش متوفر في الفرع'],
  [/تاخير|اتاخر|متاخر|late|delay|too long|took long/, 'branch', 'تأخير'],
  [/طيار|pilot|rider|driver|courier|حادث|اتوه/, 'pilot', 'السبب على الطيار'],
  [/عميل|customer|رفض|مش بيرد|لا يرد|مبيردش|reach|غير العنوان|changed mind|duplicate order/, 'customer', 'السبب على العميل'],
  [/طلبات|talabat|platform|system|سيستم|منصه/, 'platform', 'السبب على المنصة'],
];

function setup(app) {
  const { db, fail } = app;
  const parse = x => { try { return JSON.parse(x); } catch { return null; } };

  async function dayList(day) {
    const r = await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(day), d = r ? parse(r.data) : null;
    const names = app.apexNameMap ? await app.apexNameMap() : {}, nm = u => names[u] || u || null;
    const m = app.talabat ? await app.talabat.matchDay(day) : { rows: [], matches: new Map() };
    const learned = app.learn ? await app.learn.pairs('cancel:owner') : new Map();
    const confirmed = new Map((await db.prepare('SELECT * FROM cancel_owners WHERE day = ?').all(day)).map(x => [x.key, x]));
    const lateOut = new Map((d?.lateOut || []).map(x => [String(x.no), x]));
    const out = [], usedApex = new Set();
    const suggest = (reasonText, ev) => {
      const why = [];
      let owner = null;
      const k = reasonKey(reasonText), seen = k && learned.get(k);
      if (seen) {
        const [best, n] = [...seen].sort((a, b) => b[1] - a[1])[0], all = [...seen.values()].reduce((a, b) => a + b, 0);
        if (n >= 2 && n / all >= 0.6) { owner = best; why.push('نفس السبب اتراجع ' + n + ' مرات وكان على: ' + OWNERS[best]); }
      }
      for (const e of ev) { if (!owner && e.owner) owner = e.owner; why.push(e.text); }
      if (!owner && reasonText) for (const [re, o, t] of RULES) if (re.test(norm(reasonText))) { owner = o; why.push(t); break; }
      return { owner: owner || null, why };
    };
    // Talabat cancellations (with the Apex order they were tied to, cancelled or not).
    for (const o of m.rows) {
      if (o.status !== 'CANCELLED' && o.status !== 'REJECTED') continue;
      const a = m.matches.get(o.id), ev = [];
      if (a) usedApex.add(String(a.no));
      const ownerTxt = String(o.cancel_owner || '').replace(/^Owner:\s*/i, '');
      if (a?.items && !a.items.ok && !a.items.reviewedOk) ev.push({ owner: 'employee', text: 'الأصناف على Apex مش زي طلبات: ' + [...a.items.missingOnApex, ...a.items.extraOnApex].slice(0, 4).join('، ') });
      if (a && o.accepted_at && Date.parse(a.at) - o.accepted_at > LATE_ENTRY_MIN * 60000) ev.push({ owner: 'employee', text: 'اتضرب على Apex بعد ' + Math.round((Date.parse(a.at) - o.accepted_at) / 60000) + ' دقيقة من القبول' });
      if (!a && o.accepted_at && o.status === 'CANCELLED') ev.push({ owner: 'employee', text: 'اتقبل على طلبات ومالقيناهوش على Apex' });
      const lo = a && lateOut.get(String(a.no));
      if (lo) ev.push({ owner: 'branch', text: 'خرج من الفرع بعد ' + lo.wait + ' دقيقة' });
      if (o.picked_up_at && o.cancelled_at && o.cancelled_at - o.picked_up_at > 0) ev.push({ text: 'اتلغى بعد ما الطيار استلم بـ ' + Math.round((o.cancelled_at - o.picked_up_at) / 60000) + ' دقيقة' });
      if (/customer/i.test(ownerTxt)) ev.push({ owner: 'customer', text: 'طلبات حاططه على العميل' });
      else if (/rider|transport/i.test(ownerTxt)) ev.push({ owner: 'pilot', text: 'طلبات حاططه على طيار طلبات' });
      else if (/platform/i.test(ownerTxt)) ev.push({ owner: 'platform', text: 'طلبات حاططه على المنصة' });
      else if (/vendor/i.test(ownerTxt)) ev.push({ owner: 'branch', text: 'طلبات حاططه على المطعم' });
      // Evidence that names an employee wins over Talabat's own owner.
      ev.sort((x, y) => (y.owner === 'employee') - (x.owner === 'employee'));
      const s = suggest(o.cancel_reason, ev);
      out.push({ key: 'talabat:' + o.id, source: 'talabat', ref: o.id, code: o.code, at: iso(o.cancelled_at), store: o.store, branch: a?.branch || null, apexNo: a?.no ?? null, apexSn: a?.sn ?? null, user: a?.user || null,
        pilot: null, amount: o.subtotal ?? o.total ?? null, reason: [ownerTxt, o.cancel_reason].filter(Boolean).join(' — ') || null, reasonKey: reasonKey(o.cancel_reason), ...s });
    }
    // Apex cancellations (after the pilot took the order); a Talabat one already listed above is not listed twice.
    for (const c of d?.cancels || []) {
      if (usedApex.has(String(c.no))) continue;
      const reasonText = [c.reasonName, c.reason].filter(Boolean).join(' — '), ev = [];
      const lo = lateOut.get(String(c.no));
      if (lo) ev.push({ owner: 'branch', text: 'خرج من الفرع بعد ' + lo.wait + ' دقيقة' });
      if (c.afterOut != null) ev.push({ text: 'اتلغى بعد خروجه مع الطيار بـ ' + c.afterOut + ' دقيقة' });
      const s = suggest(reasonText, ev);
      if (!s.owner && c.afterOut != null && c.afterOut >= LATE_OUT_MIN) { s.owner = 'pilot'; s.why.push('اتلغى بعد ' + c.afterOut + ' دقيقة مع الطيار'); }
      out.push({ key: 'apex:' + c.no, source: 'apex', ref: String(c.no), kind: c.kind, at: c.at, branch: c.branch, apexNo: c.no, apexSn: c.sn ?? null, user: nm(c.user), by: nm(c.by), pilot: c.pilot || null,
        amount: c.amount ?? null, reason: reasonText || null, reasonKey: reasonKey(reasonText), ...s });
    }
    for (const x of out) {
      const c = confirmed.get(x.key);
      x.confirmed = c ? { owner: c.owner, name: c.name, by: c.by_name, at: iso(c.at) } : null;
      x.final = c ? c.owner : x.owner;
      // The person it is on: the employee who entered it, the pilot, or the branch.
      x.finalName = c?.name || (x.final === 'employee' ? x.user : x.final === 'pilot' ? x.pilot : x.final === 'branch' ? x.branch || x.store : null);
    }
    return out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  }
  app.cancelOwners = dayList;

  app.route('GET', '/api/cancels/owners', async ctx => {
    await app.requireAdmin(ctx);
    const from = validDate(String(ctx.query.from || '')) ? ctx.query.from : businessDay(ctx.now), to = validDate(String(ctx.query.to || '')) ? ctx.query.to : from;
    const days = []; for (let t = Date.parse(from + 'T12:00:00Z'); t <= Date.parse(to + 'T12:00:00Z') && days.length < 62; t += 86400000) days.push(new Date(t).toISOString().slice(0, 10));
    const list = [];
    for (const d of days) for (const x of await dayList(d)) list.push({ day: d, ...x });
    return { owners: OWNERS, list };
  });
  app.route('POST', '/api/cancels/owner', async ctx => {
    const who = await app.requireAdmin(ctx, 'write');
    const b = ctx.body || {}, key = String(b.key || '').slice(0, 80);
    if (!/^(apex|talabat):\d+$/.test(key)) fail(400, 'invalid_key');
    const day = validDate(String(b.day || '')) ? b.day : businessDay(ctx.now);
    if (b.owner == null) { await db.prepare('DELETE FROM cancel_owners WHERE key = ?').run(key); await db.prepare("DELETE FROM learned WHERE kind = 'cancel:owner' AND ref = ?").run(key); return { ok: true }; }
    if (!OWNERS[b.owner]) fail(400, 'invalid_owner');
    const rk = b.reasonKey ? String(b.reasonKey).slice(0, 160) : null;
    await db.prepare(`INSERT INTO cancel_owners (key, day, source, ref, owner, name, reason_key, by_name, at) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET owner = excluded.owner, name = excluded.name, reason_key = excluded.reason_key, by_name = excluded.by_name, at = excluded.at`)
      .run(key, day, key.split(':')[0], key.split(':')[1], b.owner, b.name ? String(b.name).slice(0, 80) : null, rk, who.name, ctx.now);
    if (rk && app.learn) { await db.prepare("DELETE FROM learned WHERE kind = 'cancel:owner' AND ref = ?").run(key); await app.learn.record('cancel:owner', rk, b.owner, key); }
    await app.audit('cancel_owner', null, { actor: who.name, key, owner: b.owner });
    return { ok: true };
  });
}

export { setup, OWNERS, reasonKey };
