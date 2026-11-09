// Apex customer-card notes are not a trusted order instruction by themselves.
// Parse for employee review; never guess the taxable basis, item code, funding,
// permanence, or whether an existing platform discount already covers the benefit.
const numerals = s => String(s || '').replace(/[٠-٩۰-۹]/g, c =>
  String(c.charCodeAt(0) - (c >= '۰' ? 0x6f0 : 0x660)));
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
      if (/(?:[اإ]ضاف[هة]|كادو|هدي[هة]|فر[ىي]\b|free|مجان)/i.test(rest))
        directives.push({ kind: 'item', text: rest.replace(/^[\s.،,و]+/, '').trim(), status: 'review', reason: 'اختار كود الصنف والكمية من APEX قبل إضافته' });
    } else if ((m = /(?:خصم|discount)\s*(?:بمبلغ|بقيمة|قدرها|قيمة|مبلغ|:)?\s*(\d+(?:\.\d+)?)\s*(?:جنيه|ج|جم|egp|pounds)?\b/i.exec(section))) {
      const n = money(Number(m[1]));
      if (n > 0 && n <= 100000) directives.push({ kind: 'amount', value: n, text: section, status: 'review', reason: 'يجب تأكيد أنه خصم إضافي وغير مطبق على سعر المصدر' });
      else other.push(section);
    } else if (/(?:^|[\s،:])(?:له|ليها|ليه|يستحق|إضافة|اضافه)\s+(?:(?:\d+|واحد|اتنين)\s+)?(?:صنف|أصناف|اصناف|طبق|وجبة|وجبه|ساندوتش|ساندويتش|هدية|هديه)|(?:صنف|أصناف|اصناف|طبق|وجبة|وجبه|ساندوتش|ساندويتش)\s+(?:هدية|هديه|مجاني|مجانا|مستحق)|(?:هدية|هديه|مجاني|مجانا|gift|free\s*item)/i.test(section)) {
      directives.push({ kind: 'item', text: section, status: 'review', reason: 'اختار كود الصنف والكمية من APEX قبل إضافته' });
    } else other.push(section);
  }
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
  return { text, directives, other, oneTime: next ? !permanent : oneTime && !permanent && !split && other.length === 0, permanent, requiresReview: directives.length > 0 || oneTime || financeUnrecognized, unrecognized: financeUnrecognized || (split && !next) || (oneTime && permanent), next };
}
