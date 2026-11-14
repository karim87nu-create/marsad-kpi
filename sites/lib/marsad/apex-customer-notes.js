// Apex customer-card notes are not a trusted order instruction by themselves.
// Parse for employee review; never guess the taxable basis, item code, funding,
// permanence, or whether an existing platform discount already covers the benefit.
const numerals = s => String(s || '').replace(/[٠-٩۰-۹]/g, c =>
  String(c.charCodeAt(0) - (c >= '۰' ? 0x6f0 : 0x660)));
import { APEX_NAMES } from './menu-seed.js';
const money = n => Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
export function parseApexCustomerNote(raw) {
  const text = numerals(raw).replace(/\r/g, '\n').trim().slice(0, 1000);
  // Karim 10-11: numbers written in words and «في الميه» read like digits and «%»; the card's own words are kept for
  // rewriting it (t is only for reading).
  const t = sayNumbers(text);
  if (!text || /^\s*[.\-–ـ]*\s*$/.test(text)) return { text: '', directives: [], other: [], oneTime: false, permanent: false, requiresReview: false };
  // Karim 09-11, the notes staff really write: «خصم 15% ع الاوردر االقادم و الكومنت يتمسح» (typos included) is for one order;
  // «يتقسمو ع اوردرين» (split over two orders) is not something to guess.
  const nextOrder = /قادم|جا[يى][هة]?(?=$|[\s.,،])|يتمسح|تتمسح|اول\s*[اأ]وردر|(?:^|[\s.])(?:ع|على|علي|عى)\s*(?:ا*ل)?[اأ]?(?:وردر|ورر|ورد)|عال[اأ]?وردر/i.test(t);
  // Karim 14-11: «على مرتين» is the same as «ع اوردرين».
  // «لمده اوردرين» is the whole discount on each of them (below), not a split.
  const split = !/(?:لمد[ةه]|لعدد)\s*(?:[اأ]وردرين|اوردارين|طلبين|مرتين)/.test(t) && /(?:يتقسم|تتقسم|مقسم|مقسوم)|(?:[اأ]وردرين|طلبين|اوردارين)|(?:على|علي|ع)\s*(?:مرتين|دفعتين)|(?:على|علي|ع)\s*(?:[2-9]|10)\s*(?:[اأ]ورد[ا]?رات|طلبات|[اأ]وردر|طلب|مرات)/i.test(t);
  // The whole discount on each of N orders (real notes 14-11: «خصم 20% لمده 3 اوردارات»): the card counts them down.
  const WORDS = { اتنين: 2, اثنين: 2, تلات: 3, تلاته: 3, تلاتة: 3, ثلاث: 3, ثلاثة: 3, اربع: 4, اربعة: 4, أربع: 4, خمس: 5 };
  const repeatM = !split && /(?:لمد[ةه]|لعدد|ل)\s*(?:(\d+|اتنين|اثنين|تلاته?|تلاتة|ثلاثة?|اربعة?|أربع|خمس)\s*(?:[اأ]ورد[ا]?رات|[اأ]وردر|طلبات|طلب|مرات)|(مرتين|[اأ]وردرين|اوردارين|طلبين))/.exec(t);
  const repeat = !repeatM ? 0 : repeatM[2] ? 2 : Number(repeatM[1]) || WORDS[repeatM[1]] || 0;
  // «خصم 45% كل اوردر 15%» (real note 14-11): 15% on each of three orders, never 45% at once.
  const eachM = /كل\s*(?:[اأ]وردر|طلب|مر[ةه])\s*(\d{1,3}(?:\.\d+)?)\s*(?:%|٪)/.exec(t);
  // Over how many orders (Karim 09-11: the first gets its share, the card then says what is left for the next).
  // Real note 14-11: «يتقسمو ع اورد» (the word cut off) is over two orders, as nearly every such card says; a bare
  // «يتقسم» with no orders written stays unclear.
  const orders = !split ? 1 : /[اأ]وردرين|طلبين|اوردارين|مرتين|دفعتين/.test(t) ? 2
    : (m => m ? Number(m[1]) || WORDS[m[1]] || 0 : /(?:ع|على|علي)\s*(?:ال)?[اأ]ورد/.test(t) ? 2 : 0)(/(\d+|اتنين|اثنين|تلاته?|تلاتة|ثلاثة?|اربعة?|أربع|خمس)\s*(?:[اأ]ورد[ا]?رات|[اأ]وردر|طلبات|طلب|مرات)/.exec(t));
  const oneTime = nextOrder || /(?:مرة\s*واحدة|مره\s*واحده|للطلب\s*(?:الواحد|القادم|الجاي|الحالي|ده|دا)|للاوردر\s*(?:الحالي|ده|دا)|للأوردر\s*(?:الحالي|ده|دا)|(?:ال)?طلب\s*واحد|المره\s*دي\s*فقط|المرة\s*دي\s*فقط|اوردر\s*(?:واحد|واحده|القادم)|order\s*only|next\s*order|one[ -]?time)/i.test(text);
  const permanent = !eachM && !repeat && /(?:دائم|دايم|ثابت|(?:ع|على|علي)\s*طول|كل\s*(?:مرة|مره|طلب|اوردر)|permanent|every\s*order|always)/i.test(text);
  // Lines, and sentences ended by «.» (Karim 10-11: «خصم 15% ع الاوردر القادم. العميل بيحب الشطة» — the second
  // sentence is not part of the discount and stays on the card). A piece that only says «ع الاوردر القادم» or
  // «والكومنت يتمسح» belongs to the sentence before it.
  const rawSections = [], pieces = [];
  for (const line of text.split(/[\n؛;|]+/))
    for (const piece of line.split(/(?<!\d)\.+(?=\s*[^\s\d.])/).map(x => x.replace(/^[\s.]+/, '').trim()).filter(Boolean)) {
      if (rawSections.length && !normArabic(sayNumbers(piece)).replace(FILLER, ' ').replace(/\s+/g, '').length) { rawSections[rawSections.length - 1] += '. ' + piece; pieces[pieces.length - 1].push(piece); }
      else { rawSections.push(piece); pieces.push([piece]); }
    }
  const directives = [], other = [], kinds = [];
  for (const own of rawSections) {
    let m;
    const section = sayNumbers(own), before = directives.length;
    if ((m = /(?:خصم|discount)\s*(?:بنسبة|نسبة|قدرها|بقيمة|بمبلغ|of|:)?\s*(\d{1,3}(?:\.\d+)?)\s*(%|٪|في\s*المية|بالمية|percent)/i.exec(section))) {
      const n = money(Number(m[1]));
      if (n > 0 && n <= 100) directives.push({ kind: 'percent', value: n, text: own, status: 'review', reason: 'أساس احتساب النسبة وتداخل الخصومات يحتاجان تأكيدًا' });
      else other.push(own);
      // «خصم 15% ع الاوردر القادم واضافه شوربه لسان عصفور فرى» / «… وكادو مع الاوردر»: the gift in the same line too.
      const rest = section.slice(m.index + m[0].length);
      if (GIFT_WORDS.test(rest))
        directives.push({ kind: 'item', text: rest.replace(/^[\s.،,و]+/, '').trim(), status: 'review', reason: 'اختار كود الصنف والكمية من APEX قبل إضافته' });
    } else if ((m = /(?:خصم|discount)\s*(?:بمبلغ|بقيمة|قدرها|قيمة|مبلغ|:)?\s*(\d+(?:\.\d+)?)\s*(?:جنيه|ج|جم|egp|pounds)?\b/i.exec(section))) {
      const n = money(Number(m[1]));
      if (n > 0 && n <= 100000) directives.push({ kind: 'amount', value: n, text: own, status: 'review', reason: 'يجب تأكيد أنه خصم إضافي وغير مطبق على سعر المصدر' });
      else other.push(own);
    } else if (GIFT_WORDS.test(section)) {
      directives.push({ kind: 'item', text: own, status: 'review', reason: 'اختار كود الصنف والكمية من APEX قبل إضافته' });
    } else other.push(own);
    kinds.push(directives.length > before);
  }
  for (const d of directives) if (d.kind === 'item') Object.assign(d, itemOf(d.text));
  // «ورق عنب وطحينة» = two items, when each part alone is surely one menu item.
  for (let i = directives.length - 1; i >= 0; i--) {
    const d = directives[i];
    if (d.kind !== 'item' || d.suggest[0]?.sure) continue;
    const parts = sureParts(d.text);
    if (parts && parts.length > 1) directives.splice(i, 1, ...parts.map(x => ({ ...d, text: x, ...itemOf(x), of: d.text })));
  }
  let next = null;
  const share = directives.filter(d => d.kind === 'percent' || d.kind === 'amount');
  if (!split && share.length === 1 && share[0].kind === 'percent' && eachM) {
    // «خصم 45% كل اوردر 15%»: this order 15%, the card then says what is left.
    const d = share[0], each = money(Number(eachM[1])), total = d.value, n = each > 0 ? Math.round(total / each) : 0;
    if (n >= 2 && n <= 10 && Math.abs(n * each - total) < 0.01) {
      d.split = { total, orders: n }; d.value = each;
      next = { sentence: n - 1 === 1 ? 'خصم ' + each + '% ع الاوردر القادم والكومنت يتمسح.' : 'خصم ' + money(total - each) + '% كل اوردر ' + each + '%.', section: d.text };
    }
  } else if (!split && share.length === 1 && repeat >= 2 && repeat <= 10) {
    // «خصم 20% لمده 3 اوردارات»: the whole discount now, and the card counts the orders down.
    const d = share[0], left = repeat - 1, unit = d.kind === 'percent' ? '%' : ' جنيه';
    d.repeat = { orders: repeat };
    next = { sentence: left === 1 ? 'خصم ' + d.value + unit + ' ع الاوردر القادم والكومنت يتمسح.' : 'خصم ' + d.value + unit + ' لمده ' + left + ' اوردرات.', section: d.text };
  } else if (split && orders >= 2 && orders <= 10 && share.length === 1) {
    const d = share[0], total = d.value, each = Math.round(total / orders * 100) / 100, left = orders - 1;
    d.split = { total, orders }; d.value = each;
    const unit = d.kind === 'percent' ? '%' : ' جنيه';
    const sentence = left === 1 ? 'خصم ' + each + unit + ' ع الاوردر القادم والكومنت يتمسح.'
      : 'خصم ' + Math.round((total - each) * 100) / 100 + unit + ' يتقسمو ع ' + (left === 2 ? 'اوردرين' : left + ' اوردرات') + ' والكومنت يتمسح.';
    next = { sentence, section: d.text };
  }
  const financeUnrecognized = /(?:خصم|discount|هدية|هديه|مجاني|مجانا|يستحق|صنف|اصناف|أصناف|كوبون|(?:له|ليها|ليه)\s+\d+|(?:إضافة|اضافه)\s+(?:طبق|صنف|وجبة|وجبه))/i.test(other.join(' '));
  // A one-order discount/gift written next to something else about the customer: after the order only the
  // discount/gift sentence goes; the rest stays on the card as it was written.
  if (!next && !split && !permanent && !financeUnrecognized && other.length && directives.length && (oneTime || directives.some(d => d.kind === 'item')))
    next = { sentence: '', section: '' };
  // The card's whole new text: the used sentence(s) taken out (a split one says what is left), the rest as written.
  if (next) {
    const used = share.length === 1 && (split || share[0].split || share[0].repeat) ? share[0].text : null;
    // Taken out of the card's own text, so what stays keeps its words and separators («رأي العميل: كويس | …»).
    let out = text;
    rawSections.forEach((x, i) => {
      if (!kinds[i]) return;
      pieces[i].forEach((piece, k) => {
        const at = out.indexOf(piece);
        if (at >= 0) out = out.slice(0, at) + (x === used && k === 0 ? '\u0000' : '') + out.slice(at + piece.length);
      });
    });
    out = out.replace(/(\s*[.|؛;\n]\s*)(?:[.|؛;\n]\s*)+/g, '$1').replace(/^[\s.|؛;]+|[\s|؛;]+$/g, '').replace(/\u0000\.*/, next.sentence).trim();
    next.note = out;
  }
  return { text, directives, other, oneTime: next ? !permanent : (oneTime || directives.some(d => d.kind === 'item')) && !permanent && !split && other.length === 0, permanent, requiresReview: directives.length > 0 || oneTime || financeUnrecognized, unrecognized: financeUnrecognized || (split && !next) || (oneTime && permanent), next };
}

// A free item on the card is given once (a compensation), unless the card says always.
// Karim 10-11: «العميل ليه صنف معين» however it is written — other words, other order, spelling mistakes. The words that
// say «a free item for him»; what is left is the dish, matched to Apex's menu by its letters, not by exact wording.
const GIFT_WORDS = /(?:^|[\s،:.,(])[وب]?(?:ل[هي]|ليه|ليها|لها|يستحق|مستحق|يتضاف|تتضاف|هيتضاف|ضيف|ضيفو|ضيفوا|[اإأ]ضاف[هةو]?|زياد[هة]|هدي[هة]|هدا?يا|كادو|جيفت|gift|فر[يى]|free|مجان[اًي]?|ببلاش|بلاش|ع(?:لى|لي)?\s*حساب|عالحساب|تعويض|اعتذار|تراض[يى])(?=$|[\s،:.,)])/i;
const FILLER = /(?:^|\s)[و]?(?:ل[هي]|ليه|ليها|لها|يستحق|مستحق|يتضاف|تتضاف|هيتضاف|ضيف|ضيفو|ضيفوا|[اإأ]ضاف[هةو]?|زياد[هة]|هدي[هة]|هدا?يا|كادو|جيفت|gift|فر[يى]|free|مجان[اًي]?|ببلاش|بلاش|ع(?:لى|لي)?\s*حساب\s*(?:المطعم|الفرع)?|عالحساب|تعويض|اعتذار|تراض[يى]|العميل|عميل|صنف|اصناف|أصناف|مع|في|ف|ع|على|علي|عل|ال?[اأ]?وردر|ا*لقادم|القادمه|الجاي|الجاى|اللي|جاي|طلب|الطلب|الكومنت|كومنت|يتمسح|تتمسح|بعد|كده|و|او|أو|مره|مرة|واحده|واحدة)(?=$|\s)/gi;
const QTY = { واحد: 1, واحده: 1, واحدة: 1, اتنين: 2, اثنين: 2, تلاته: 3, تلاتة: 3, ثلاثة: 3, تلات: 3, اربعه: 4, اربعة: 4 };
export const normArabic = v => String(v || '').toLowerCase().replace(/[‎‏‪-‮]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  .replace(/[ًٌٍَُِّْـ]/g, '').replace(/[^؀-ۿa-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const stem = w => w.replace(/^(?:وال|بال|فال|كال|لل|ال)(?=..)/, '');
const grams = s => { const out = new Map(), t = ' ' + s + ' '; for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); out.set(g, (out.get(g) || 0) + 1); } return out; };
const dice = (a, b) => { const A = grams(a), B = grams(b); let both = 0, n = 0; for (const [g, c] of A) { n += c; both += Math.min(c, B.get(g) || 0); } for (const c of B.values()) n += c; return n ? 2 * both / n : 0; };
let MENU = null;
const menu = () => MENU || (MENU = Object.entries(APEX_NAMES).map(([no, name]) => ({ no, name, key: normArabic(name).split(' ').map(stem).join(' ') })).filter(x => x.key));
export function guessApexItem(text, limit = 3) {
  const words = normArabic(text).replace(FILLER, ' ').split(' ').map(stem).map(w => SAME[w] || w).filter(w => w && !/^\d+$/.test(w) && !QTY[w]);
  const key = words.join(' ');
  if (key.length < 3) return [];
  const all = menu().map(x => {
    // The letters of the whole name, and how many of the note's words are (nearly) in it — a wrong letter still counts.
    const xw = x.key.split(' '), hit = words.filter(w => xw.some(y => y === w || (w.length > 3 && dice(w, y) >= 0.67))).length;
    const score = 0.55 * dice(key, x.key) + 0.45 * hit / Math.max(words.length, xw.filter(y => !/^طلبات$|^عرض$/.test(y)).length) - (/طلبات|عرض/.test(x.name) ? 0.03 : 0);
    // «sure» = every word of the note is in the name and the name has nothing more (beyond «سادة/فرد/طبق/سلطة»):
    // only then is it put in by itself; anything else (one word for many sizes, an item not on the menu) is chosen by staff.
    const need = words.filter(w => !GENERIC.has(w));
    const extra = xw.filter(y => !GENERIC.has(y) && !words.some(w => y === w || (w.length > 3 && dice(w, y) >= 0.67))).length;
    return { itemNo: x.no, name: x.name, score: Math.round(score * 100) / 100, exact: need.length > 0 && need.every(w => xw.some(y => y === w || (w.length > 3 && dice(w, y) >= 0.67))) && extra === 0 };
  }).sort((a, b) => b.exact - a.exact || b.score - a.score).filter(x => x.score >= 0.35);
  const exact = all.filter(x => x.exact);
  return all.slice(0, limit).map(({ exact: e, ...x }, i) => (i === 0 && e && exact.length === 1 ? { ...x, sure: true } : x));
}
const GENERIC = new Set(['ساده', 'فرد', 'طبق', 'سلطه']);
const SAME = { رز: 'ارز', روز: 'ارز', عيش: 'رغيف', بيبسي: 'بيبسي' };
// Cut at « و» / «،» / «+» only where every piece is surely one item («ورق عنب» is never cut at its own «و»).
function sureParts(text, depth = 0) {
  if (guessApexItem(text, 1)[0]?.sure) return [text];
  if (depth > 3) return null;
  const re = /\s+و\s*|\s*[+،,]\s*/g;
  let m;
  while ((m = re.exec(text))) {
    const left = text.slice(0, m.index).trim(), right = text.slice(m.index + m[0].length).trim();
    if (!left || !right || !guessApexItem(left, 1)[0]?.sure) continue;
    const rest = sureParts(right, depth + 1);
    if (rest) return [left, ...rest];
  }
  return null;
}
function itemOf(text) {
  const t = normArabic(text);
  const m = /(?:^|\s)(\d{1,2})(?=\s)/.exec(' ' + t + ' ') || new RegExp('(?:^|\\s)(' + Object.keys(QTY).join('|') + ')(?=\\s|$)').exec(t);
  const qty = m ? Number(m[1]) || QTY[m[1]] || 1 : 1;
  return { qty: Math.min(Math.max(qty, 1), 9), suggest: guessApexItem(text) };
}

// «ستين في الميه» → «60 %», «خمسة وعشرين» → «25», «مية جنيه» → «100 جنيه».
const UNITS = { واحد: 1, واحده: 1, اتنين: 2, اثنين: 2, تلاته: 3, تلاتة: 3, ثلاثة: 3, تلات: 3, اربعه: 4, اربعة: 4, أربعة: 4, خمسه: 5, خمسة: 5, خمس: 5, سته: 6, ستة: 6, سبعه: 7, سبعة: 7, تمانيه: 8, ثمانية: 8, تسعه: 9, تسعة: 9,
  عشره: 10, عشرة: 10, حداشر: 11, اتناشر: 12, تلتاشر: 13, اربعتاشر: 14, خمستاشر: 15, خمسطاشر: 15, ستاشر: 16, سبعتاشر: 17, تمنتاشر: 18, تسعتاشر: 19 };
const TENS = { عشرين: 20, تلاتين: 30, ثلاثين: 30, اربعين: 40, أربعين: 40, خمسين: 50, ستين: 60, سبعين: 70, تمانين: 80, ثمانين: 80, تسعين: 90, ميه: 100, مية: 100, مائة: 100, مئة: 100, ميتين: 200 };
const UW = Object.keys(UNITS).sort((a, b) => b.length - a.length).join('|'), TW = Object.keys(TENS).sort((a, b) => b.length - a.length).join('|');
function sayNumbers(s) {
  return String(s)
    .replace(new RegExp('(^|[\\s.،,])(' + UW + ')\\s+و\\s*(' + TW + ')(?=$|[\\s.،,%])', 'g'), (m, pre, u, tn) => pre + (UNITS[u] + TENS[tn]))
    .replace(new RegExp('(^|[\\s.،,])(' + TW + ')(?=$|[\\s.،,%])', 'g'), (m, pre, tn) => pre + TENS[tn])
    .replace(new RegExp('(^|[\\s.،,])(' + UW + ')(?=\\s*(?:%|٪|في|بال|جنيه|ج\\b|[اأ]وردر|طلب))', 'g'), (m, pre, u) => pre + UNITS[u])
    .replace(/(\d)\s*(?:(?:في|ف)\s*(?:ال)?(?:مي[هة]|مائ[هة]|مئ[هة])|بال(?:مي[هة]|مائ[هة]|مئ[هة]))/g, '$1%');
}
