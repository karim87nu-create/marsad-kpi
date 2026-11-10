// Apex customer-card notes are not a trusted order instruction by themselves.
// Parse for employee review; never guess the taxable basis, item code, funding,
// permanence, or whether an existing platform discount already covers the benefit.
const numerals = s => String(s || '').replace(/[٠-٩۰-۹]/g, c =>
  String(c.charCodeAt(0) - (c >= '۰' ? 0x6f0 : 0x660)));
import { APEX_NAMES } from './menu-seed.js';
const money = n => Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
export function parseApexCustomerNote(raw) {
  const text = numerals(raw).replace(/\r/g, '\n').trim().slice(0, 1000);
  if (!text || /^\s*[.\-–ـ]*\s*$/.test(text)) return { text: '', directives: [], other: [], oneTime: false, permanent: false, requiresReview: false };
  // Karim 09-11, the notes staff really write: «خصم 15% ع الاوردر االقادم و الكومنت يتمسح» (typos included) is for one order;
  // «يتقسمو ع اوردرين» (split over two orders) is not something to guess.
  const nextOrder = /قادم|جاي\b|جاى|يتمسح|تتمسح|(?:^|[\s.])(?:ع|على|علي|عى)\s*(?:ا*ل)?[اأ]?(?:وردر|ورر|ورد)|عال[اأ]?وردر/i.test(text);
  const split = /(?:يتقسم|تتقسم|مقسم|مقسوم)|(?:[اأ]وردرين|طلبين|اوردارين)|(?:على|ع)\s*(?:2|٢|اتنين)\s*(?:[اأ]وردر|طلب)/i.test(text);
  // Over how many orders (Karim 09-11: the first gets its share, the card then says what is left for the next).
  const WORDS = { اتنين: 2, اثنين: 2, تلات: 3, تلاته: 3, تلاتة: 3, ثلاث: 3, ثلاثة: 3, اربع: 4, اربعة: 4, أربع: 4, خمس: 5 };
  const orders = !split ? 1 : /[اأ]وردرين|طلبين|اوردارين/.test(text) ? 2
    : (m => m ? Number(m[1]) || WORDS[m[1]] || 0 : 0)(/(\d+|اتنين|اثنين|تلاته?|تلاتة|ثلاثة?|اربعة?|أربع|خمس)\s*(?:[اأ]وردرات|[اأ]وردر|طلبات|طلب)/.exec(text));
  const oneTime = nextOrder || /(?:مرة\s*واحدة|مره\s*واحده|للطلب\s*(?:الواحد|القادم|الجاي|الحالي|ده|دا)|للاوردر\s*(?:الحالي|ده|دا)|للأوردر\s*(?:الحالي|ده|دا)|(?:ال)?طلب\s*واحد|المره\s*دي\s*فقط|المرة\s*دي\s*فقط|اوردر\s*(?:واحد|واحده|القادم)|order\s*only|next\s*order|one[ -]?time)/i.test(text);
  const permanent = /(?:دائم|دايم|كل\s*(?:مرة|مره|طلب|اوردر)|permanent|every\s*order|always)/i.test(text);
  const sections = text.split(/[\n؛;|]+/).map(s => s.trim()).filter(Boolean);
  const directives = [], other = [];
  for (const section of sections) {
    let m;
    if ((m = /(?:خصم|discount)\s*(?:بنسبة|نسبة|قدرها|بقيمة|بمبلغ|of|:)?\s*(\d{1,3}(?:\.\d+)?)\s*(%|٪|في\s*المية|بالمية|percent)/i.exec(section))) {
      const n = money(Number(m[1]));
      if (n > 0 && n <= 100) directives.push({ kind: 'percent', value: n, text: section, status: 'review', reason: 'أساس احتساب النسبة وتداخل الخصومات يحتاجان تأكيدًا' });
      else other.push(section);
      // «خصم 15% ع الاوردر القادم واضافه شوربه لسان عصفور فرى» / «… وكادو مع الاوردر»: the gift in the same line too.
      const rest = section.slice(m.index + m[0].length);
      if (GIFT_WORDS.test(rest))
        directives.push({ kind: 'item', text: rest.replace(/^[\s.،,و]+/, '').trim(), status: 'review', reason: 'اختار كود الصنف والكمية من APEX قبل إضافته' });
    } else if ((m = /(?:خصم|discount)\s*(?:بمبلغ|بقيمة|قدرها|قيمة|مبلغ|:)?\s*(\d+(?:\.\d+)?)\s*(?:جنيه|ج|جم|egp|pounds)?\b/i.exec(section))) {
      const n = money(Number(m[1]));
      if (n > 0 && n <= 100000) directives.push({ kind: 'amount', value: n, text: section, status: 'review', reason: 'يجب تأكيد أنه خصم إضافي وغير مطبق على سعر المصدر' });
      else other.push(section);
    } else if (GIFT_WORDS.test(section)) {
      directives.push({ kind: 'item', text: section, status: 'review', reason: 'اختار كود الصنف والكمية من APEX قبل إضافته' });
    } else other.push(section);
  }
  for (const d of directives) if (d.kind === 'item') Object.assign(d, itemOf(d.text));
  let next = null;
  const share = directives.filter(d => d.kind === 'percent' || d.kind === 'amount');
  if (split && orders >= 2 && orders <= 10 && share.length === 1) {
    const d = share[0], total = d.value, each = Math.round(total / orders * 100) / 100, left = orders - 1;
    d.split = { total, orders }; d.value = each;
    const unit = d.kind === 'percent' ? '%' : ' جنيه';
    const sentence = left === 1 ? 'خصم ' + each + unit + ' ع الاوردر القادم والكومنت يتمسح.'
      : 'خصم ' + Math.round((total - each) * 100) / 100 + unit + ' يتقسمو ع ' + (left === 2 ? 'اوردرين' : left + ' اوردرات') + ' والكومنت يتمسح.';
    next = { sentence, section: d.text };
  }
  const financeUnrecognized = /(?:خصم|discount|هدية|هديه|مجاني|مجانا|يستحق|صنف|اصناف|أصناف|كوبون|(?:له|ليها|ليه)\s+\d+|(?:إضافة|اضافه)\s+(?:طبق|صنف|وجبة|وجبه))/i.test(other.join(' '));
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
  const words = normArabic(text).replace(FILLER, ' ').split(' ').map(stem).filter(w => w && !/^\d+$/.test(w) && !QTY[w]);
  const key = words.join(' ');
  if (key.length < 3) return [];
  return menu().map(x => {
    // The letters of the whole name, and how many of the note's words are (nearly) in it — a wrong letter still counts.
    const xw = x.key.split(' '), hit = words.filter(w => xw.some(y => y === w || (w.length > 3 && dice(w, y) >= 0.67))).length;
    const score = 0.55 * dice(key, x.key) + 0.45 * hit / Math.max(words.length, xw.filter(y => !/^طلبات$|^عرض$/.test(y)).length) - (/طلبات|عرض/.test(x.name) ? 0.03 : 0);
    return { itemNo: x.no, name: x.name, score: Math.round(score * 100) / 100 };
  }).sort((a, b) => b.score - a.score).filter(x => x.score >= 0.35).slice(0, limit);
}
function itemOf(text) {
  const t = normArabic(text);
  const m = /(?:^|\s)(\d{1,2})(?=\s)/.exec(' ' + t + ' ') || new RegExp('(?:^|\\s)(' + Object.keys(QTY).join('|') + ')(?=\\s|$)').exec(t);
  const qty = m ? Number(m[1]) || QTY[m[1]] || 1 : 1;
  return { qty: Math.min(Math.max(qty, 1), 9), suggest: guessApexItem(text) };
}
