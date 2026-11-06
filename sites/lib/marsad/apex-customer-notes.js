// Apex customer-card notes are not a trusted order instruction by themselves.
// Parse for employee review; never guess the taxable basis, item code, funding,
// permanence, or whether an existing platform discount already covers the benefit.
const numerals = s => String(s || '').replace(/[٠-٩۰-۹]/g, c =>
  String(c.charCodeAt(0) - (c >= '۰' ? 0x6f0 : 0x660)));
const money = n => Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
export function parseApexCustomerNote(raw) {
  const text = numerals(raw).replace(/\r/g, '\n').trim().slice(0, 1000);
  if (!text || /^\s*[.\-–ـ]*\s*$/.test(text)) return { text: '', directives: [], other: [], oneTime: false, permanent: false, requiresReview: false };
  const oneTime = /(?:مرة\s*واحدة|مره\s*واحده|للطلب\s*(?:الواحد|القادم|الجاي|الحالي|ده|دا)|للاوردر\s*(?:الحالي|ده|دا)|للأوردر\s*(?:الحالي|ده|دا)|(?:ال)?طلب\s*واحد|المره\s*دي\s*فقط|المرة\s*دي\s*فقط|اوردر\s*(?:واحد|واحده|القادم)|order\s*only|next\s*order|one[ -]?time)/i.test(text);
  const permanent = /(?:دائم|دايم|كل\s*(?:مرة|مره|طلب|اوردر)|permanent|every\s*order|always)/i.test(text);
  const sections = text.split(/[\n؛;|]+/).map(s => s.trim()).filter(Boolean);
  const directives = [], other = [];
  for (const section of sections) {
    let m;
    if ((m = /(?:خصم|discount)\s*(?:بنسبة|نسبة|قدرها|بقيمة|بمبلغ|of|:)?\s*(\d{1,3}(?:\.\d+)?)\s*(%|٪|في\s*المية|بالمية|percent)/i.exec(section))) {
      const n = money(Number(m[1]));
      if (n > 0 && n <= 100) directives.push({ kind: 'percent', value: n, text: section, status: 'review', reason: 'أساس احتساب النسبة وتداخل الخصومات يحتاجان تأكيدًا' });
      else other.push(section);
    } else if ((m = /(?:خصم|discount)\s*(?:بمبلغ|بقيمة|قدرها|قيمة|مبلغ|:)?\s*(\d+(?:\.\d+)?)\s*(?:جنيه|ج|جم|egp|pounds)?\b/i.exec(section))) {
      const n = money(Number(m[1]));
      if (n > 0 && n <= 100000) directives.push({ kind: 'amount', value: n, text: section, status: 'review', reason: 'يجب تأكيد أنه خصم إضافي وغير مطبق على سعر المصدر' });
      else other.push(section);
    } else if (/(?:^|[\s،:])(?:له|ليها|ليه|يستحق|إضافة|اضافه)\s+(?:(?:\d+|واحد|اتنين)\s+)?(?:صنف|أصناف|اصناف|طبق|وجبة|وجبه|ساندوتش|ساندويتش|هدية|هديه)|(?:صنف|أصناف|اصناف|طبق|وجبة|وجبه|ساندوتش|ساندويتش)\s+(?:هدية|هديه|مجاني|مجانا|مستحق)|(?:هدية|هديه|مجاني|مجانا|gift|free\s*item)/i.test(section)) {
      directives.push({ kind: 'item', text: section, status: 'review', reason: 'اختار كود الصنف والكمية من APEX قبل إضافته' });
    } else other.push(section);
  }
  const financeUnrecognized = /(?:خصم|discount|هدية|هديه|مجاني|مجانا|يستحق|صنف|اصناف|أصناف|كوبون|(?:له|ليها|ليه)\s+\d+|(?:إضافة|اضافه)\s+(?:طبق|صنف|وجبة|وجبه))/i.test(other.join(' '));
  return { text, directives, other, oneTime: oneTime && !permanent && other.length === 0, permanent, requiresReview: directives.length > 0 || oneTime || financeUnrecognized, unrecognized: financeUnrecognized || (oneTime && permanent) };
}
