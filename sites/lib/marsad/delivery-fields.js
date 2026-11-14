// Presentation fields never replace the conservative customer matching keys.
export function deliveryPhone(value) {
  let s = String(value || '').trim().replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c >= '۰' ? 0x6f0 : 0x660)));
  if (/[x*•…]/i.test(s)) return '';
  s = s.replace(/[\s().-]/g, '').replace(/^00/, '+');
  if (/^\+?201[0125]\d{8}$/.test(s)) s = '0' + s.replace(/^\+?20/, '');
  return /^\+?\d{7,15}$/.test(s) ? s : '';
}
export function deliveryLabel(name, source, payment, code) {
  const tag = String(code || '').replace(/\D/g, '').slice(0, 10);
  const suffix = '/' + (source === 'talabat' ? 'طلبات' : 'موقع') + '/' + (payment === 'paid' ? 'مدفوع' : payment === 'cash' ? 'كاش' : '؟') + (tag ? '/#' + tag : '');
  const clean = String(name || 'عميل').replace(/#\s*\d+/g, '').replace(/\s+/g, ' ').trim() || 'عميل';
  return clean.slice(0, 50 - suffix.length).trim() + suffix;
}
export function deliveryAddress(value, zone = '') {
  let floor = '', flat = '';
  const street = String(value || '').replace(/(?:الدور|الطابق|floor|الشقة|شقة|apartment|apt\.?|flat)\s*[:：]?\s*([\d٠-٩۰-۹A-Za-z/-]+|الأرضي|أرضي|الاول|الأول|الثاني|الثالث|الرابع|الخامس)/gi, (all, v) => {
    if (/^(?:الدور|الطابق|floor)/i.test(all)) floor = v.trim(); else flat = v.trim();
    return '';
  });
  const key = s => s.trim().replace(/^(?:محافظة|governorate|منطقة|المنطقة|district|area)\s*[:：]?\s*/i, '')
    .normalize('NFKD').replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase().replace(/\s+/g, ' ');
  const areas = (Array.isArray(zone) ? zone : [zone]).map(s => String(s || '').trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  // Compared in the same normalized form as key() gives (ة→ه): «محافظة القاهرة» is dropped again (11-14).
  const redundant = new Set(['مصر', 'egypt', 'القاهرة', 'cairo', 'الجيزة', 'giza'].map(key));
  const withoutArea = value => {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    for (const area of areas) {
      const count = area.split(/\s+/).filter(Boolean).length;
      if (count && key(words.slice(0, count).join(' ')) === key(area)) words.splice(0, count);
      else if (count && key(words.slice(-count).join(' ')) === key(area)) words.splice(-count, count);
    }
    return words.join(' ');
  };
  return { floor, flat, street: street.split(/[،,;؛\n—]+/).map(withoutArea).filter(s => s && !redundant.has(key(s))).join('، ') };
}
export function splitDeliveryAddress(value, max = 52) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  let main = '';
  while (words.length) {
    const next = words[0], size = Array.from(main ? main + ' ' + next : next).length;
    if (main && size > max) break;
    main = main ? main + ' ' + words.shift() : words.shift();
  }
  return { main, extra: words.join(' ') };
}
export function deliveryMark(sign, extra = '', max = 120) {
  const base = String(sign || '').trim(), tail = String(extra || '').trim();
  const value = [base, tail].filter(Boolean).join(base && tail ? '/' : '');
  return Array.from(value).length <= max ? value : null;
}
// Talabat's own lines about the customer's plan («طلبات برو»، «توصيل مجاني»، «Talabat Pro customer») are not instructions
// for the kitchen: they never go into the order's comment (Karim 11-11), wherever they sit in the note.
// Karim 11-11 (Apex notes «[تبرو فري دليفري].»): Talabat writes «[tPro free delivery].», and the Arabic of it is caught too.
const PLAN = String.raw`(?:talabat\s*pro|(?<![\p{L}])t\s*-?\s*pro(?![\p{L}])|طلبات\s*برو|(?<![\p{L}])(?:تي\s*)?برو(?![\p{L}])|(?<![\p{L}])تبرو(?![\p{L}])|talabat\s*plus|طلبات\s*بلس)`;
const FREE = String.raw`(?:free\s*delivery|توصيل\s*مجان[يى]|فر[يى]\s*د[يى]?ل[يى]فر[يى]|د[يى]?ل[يى]فر[يى]\s*مجان[يى])`;
const PRO = new RegExp(String.raw`(?:عميل\s*)?${PLAN}(?:\s*(?:customer|member|subscriber|عميل|مشترك))?(?:\s*[-–:：|،,]?\s*${FREE})?|${FREE}(?:\s*(?:for|ل|لـ)\s*${PLAN}(?:\s*(?:customers?|عملاء))?)?`, 'giu');
// The website writes where the order came from in its note («مصدر الطلب: موقع الدهان»): not for the kitchen (11-11).
const SOURCE = /مصدر\s*الطلب\s*[:：]?\s*[^|،,\n]*/g;
export function stripPlatformNotes(s) {
  return String(s || '').replace(SOURCE, ' ').replace(PRO, ' ').replace(/[\[(]\s*[.\s]*[\])]\s*\.?/g, ' ').replace(/^[\s.]+$/, '').replace(/\s*([|،,\-–:])\s*(?=[|،,]|$)/g, '').replace(/^[\s|،,\-–:]+|[\s|،,\-–:]+$/g, '').replace(/\s{2,}/g, ' ').trim();
}
export function deliveryComment(order) {
  const clean = s => String(s || '').split(/\s*[|\n]\s*/).map(stripPlatformNotes).filter(Boolean).join('، ').trim();
  const parts = [clean(order.note)];
  for (const [n, item] of (order.items || []).entries()) {
    const free = [...new Set((item.freeOptions || []).map(clean).filter(Boolean))];
    // A website dish by its own (short) name, not «الصنف ١» (11-11: the Apex notes read «الصنف ١: خبز بلدي»).
    const label = order.source === 'site' ? String(item.name || '').split(/\s+/).slice(0, 3).join(' ') : 'الصنف ' + (n + 1);
    if (free.length) parts.push((order.items.length > 1 || order.source === 'site' ? label + ': ' : '') + free.join('، '));
    if (item.note) parts.push(clean(item.note));
  }
  return [...new Set(parts.filter(Boolean))].join(' | ');
}
