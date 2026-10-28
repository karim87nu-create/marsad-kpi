import { compareItems, itemKey } from './items.js';
import { referenceEvidence } from './order-identifiers.js';

export const digits = x => String(x ?? '').replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) >= 0x6f0 ? c.charCodeAt(0) - 0x6f0 : c.charCodeAt(0) - 0x660));
export const textKey = x => digits(x).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\u064b-\u065fـ]/g, '').replace(/#\s*\d+|\b\d{1,2}[:.]\d{2}\b/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
export function phoneKey(x) {
  const raw = digits(x); if (/[x*•…]/i.test(raw)) return '';
  let s = raw.replace(/\D/g, '').replace(/^00/, '');
  if (s.startsWith('20')) s = s.slice(2);
  if (s.startsWith('0')) s = s.slice(1);
  return /^1[0125]\d{8}$/.test(s) ? s : '';
}
const clean = (x, n) => typeof x === 'string' ? x.trim().slice(0, n) : '';
export function customerOf(x = {}) {
  if (!x || typeof x !== 'object') x = {};
  return { name: clean(x.name, 160), phone: phoneKey(x.phone), mobile: phoneKey(x.mobile),
    address: clean(x.address, 360), accountNo: clean(String(x.accountNo || ''), 40) };
}
export const parseJson = (x, fallback = null) => { try { return JSON.parse(x) ?? fallback; } catch { return fallback; } };
const similar = (a, b) => {
  const x = textKey(a), y = textKey(b); if (!x || !y) return null;
  if (x === y) return 1;
  const A = new Set(x.split(' ')), B = new Set(y.split(' '));
  return [...A].filter(w => B.has(w)).length / Math.max(A.size, B.size);
};
const aggregate = (xs, apex) => {
  const m = new Map();
  for (const x of Array.isArray(xs) ? xs : []) {
    const qty = Number(x.qty), price = Number(x.price);
    if (!(qty > 0) || !x.name) continue;
    const k = (apex && x.no ? String(x.no) : itemKey(x.name)) + '|' + (apex ? price : price / qty);
    const old = m.get(k);
    if (old) { old.qty += qty; if (!apex) old.price += price; }
    else m.set(k, { ...x, qty, price });
  }
  return [...m.values()];
};

// A single conservative decision used by both sources. Only matches contains confirmed links.
// Suggestions never reserve an Apex order and never teach. Manual choices reserve first.
export function resolveOrders(rows, apex, { manual = new Map(), branchOk = () => null, windowFor = () => 45 * 60000,
  learned = new Map(), ratio = 1.13 } = {}) {
  apex = [...new Map(apex.map(a => [String(a.no), a])).values()];
  const matches = new Map(), how = new Map(), states = new Map(), used = new Set();
  // Explicit human decisions take precedence; suppressed links stay suppressed.
  for (const o of rows) if (manual.has(o.id)) {
    const no = manual.get(o.id), a = apex.find(x => String(x.no) === String(no));
    if (no == null || no === 'none') states.set(o.id, { state: 'excluded', candidates: [], how: 'manual' });
    else if (a && !used.has(String(a.no))) {
      matches.set(o.id, a); how.set(o.id, 'manual'); used.add(String(a.no));
      states.set(o.id, { state: 'confirmed', how: 'manual' });
    } else states.set(o.id, { state: 'ambiguous', candidates: [], manualProposal: no });
  }
  const pairs = [];
  for (const o of rows) {
    if (manual.has(o.id) || o.excluded || !Number.isFinite(o.anchor)) continue;
    const c = customerOf(o.customer), cp = new Set([c.phone, c.mobile].filter(Boolean));
    for (const a of apex) {
      if (used.has(String(a.no))) continue;
      const reference = referenceEvidence(o, a), exact = reference.exact;
      const time = Number(a.t ?? Date.parse(a.at)), gap = time - o.anchor, branch = branchOk(o.branch, a.branch);
      const withinTime = Number.isFinite(time) && gap >= -120000 && gap <= windowFor(o);
      if (!Number.isFinite(time) || (!exact && !reference.conflict && !withinTime)) continue;
      const ac = customerOf(a.customer), ap = new Set([ac.phone, ac.mobile].filter(Boolean));
      const phone = cp.size && ap.size ? [...cp].some(p => ap.has(p)) : null;
      const name = similar(c.name, ac.name), address = similar(c.address, ac.address);
      const T = aggregate(o.items, false), A = aggregate(a.items, true);
      // Woo and Apex may share Arabic names; compareItems also translates Talabat names.
      const direct = new Map(learned);
      for (const t of T) { const ids = A.filter(x => textKey(x.name) === textKey(t.name)).map(x => [String(x.no), 2]); if (ids.length) direct.set(itemKey(t.name), new Map([...(direct.get(itemKey(t.name)) || []), ...ids])); }
      const item = T.length && A.length ? compareItems(T, A, { learned: direct, ratio }) : null;
      const money = Number(o.amount) > 0 && Number(a.amount) > 0 ? Math.abs(o.amount - a.amount) / Math.max(o.amount, a.amount) : null;
      const identity = phone === true && (name >= .6 || address >= .6);
      const nameConflict = c.name && ac.name && name != null && name < .35;
      const addressConflict = c.address && ac.address && address != null && address < .5;
      const conflict = reference.conflict || phone === false || nameConflict || addressConflict || branch === false || (item && !item.ok) || (money != null && money > .3) || !withinTime;
      // Explicit source order IDs never bypass contradictory customer or basket evidence.
      const fullEvidence = withinTime && branch === true && money != null && money < .08 && item?.ok === true && identity;
      const strong = !conflict && fullEvidence;
      const score = (exact ? 100 : 0) + (phone === true ? 42 : phone === false ? -70 : 0) +
        (name ?? 0) * 16 + (address ?? 0) * 18 + (item ? item.ok ? 32 : -24 : 0) +
        (branch === true ? 8 : branch === false ? -25 : 0) + (money == null ? 0 : Math.max(-20, 12 - money * 70)) + Math.max(0, 8 - Math.abs(gap) / 60000 / 5);
      pairs.push({ o: o.id, a, score, strong, exact, conflict, reasons: { code: exact ? 'exact' : null, referenceType: reference.type, referenceConflict: reference.conflict, phone, name, address,
        nameConflict: !!nameConflict, addressConflict: !!addressConflict, items: item ? item.ok : null, quantities: item ? item.countTalabat === item.countApex : null,
        branch, money, minutes: gap / 60000, withinTime, fullEvidence } });
    }
  }
  const sorted = pairs.sort((x, y) => Number(x.conflict) - Number(y.conflict) || y.score - x.score || String(x.a.no).localeCompare(String(y.a.no)));
  const byOrder = new Map(), byApex = new Map();
  for (const p of sorted) {
    if (!byOrder.has(p.o)) byOrder.set(p.o, []);
    if (!byApex.has(String(p.a.no))) byApex.set(String(p.a.no), []);
    byOrder.get(p.o).push(p); byApex.get(String(p.a.no)).push(p);
  }
  const listO = id => byOrder.get(id) || [], listA = no => byApex.get(String(no)) || [];
  // Require a clear winner on BOTH sides before any assignment; do not break ties by iteration order.
  for (const o of rows) {
    if (manual.has(o.id)) continue;
    const candidates = listO(o.id), best = candidates[0];
    if (!best) { states.set(o.id, { state: 'unmatched', candidates: [] }); continue; }
    const rivalOrders = candidates.filter(p => !p.conflict);
    const rivals = listA(best.a.no).filter(p => !p.conflict), margin = rivalOrders[1] ? best.score - rivalOrders[1].score : Infinity;
    const reverseMargin = rivals[1] ? rivals[0].score - rivals[1].score : Infinity;
    const clear = margin >= 15 && reverseMargin >= 15 && rivals[0] === best;
    if (best.strong && clear && !used.has(String(best.a.no))) {
      used.add(String(best.a.no)); matches.set(o.id, best.a); how.set(o.id, best.exact ? 'code' : 'evidence');
      states.set(o.id, { state: 'confirmed', how: how.get(o.id), evidence: best.reasons });
    } else states.set(o.id, { state: clear && !best.conflict ? 'tentative' : 'ambiguous', candidates: candidates.slice(0, 3).map(p => ({ no: p.a.no, sn: p.a.sn ?? null, score: Math.round(p.score), evidence: p.reasons })) });
  }
  // Include the human choice in the explanation without training from it.
  for (const o of rows) {
    const st = states.get(o.id) || { state: 'unmatched', candidates: [] };
    if (manual.has(o.id)) st.manualProposal = manual.get(o.id);
    st.confidence = ({ confirmed: 'SURE', tentative: 'PROBABLE', ambiguous: 'AMBIGUOUS', unmatched: 'NO MATCH', excluded: 'EXCLUDED' })[st.state] || 'AMBIGUOUS';
    states.set(o.id, st);
  }
  return { matches, how, states, used };
}
