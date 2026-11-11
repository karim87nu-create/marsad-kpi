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
  const suffix = ' ' + (source === 'talabat' ? 'طلبات' : 'موقع') + '/' + (payment === 'paid' ? 'مدفوع' : payment === 'cash' ? 'كاش' : '؟') + (tag ? ' #' + tag : '');
  const clean = String(name || 'عميل').replace(/#\s*\d+/g, '').replace(/\s+/g, ' ').trim() || 'عميل';
  return clean.slice(0, 50 - suffix.length).trim() + suffix;
}
export function deliveryAddress(value, zone = '') {
  let floor = '', flat = '';
  const street = String(value || '').replace(/(?:الدور|الطابق|floor|الشقة|شقة|apartment|apt\.?|flat)\s*[:：]?\s*([\d٠-٩۰-۹A-Za-z/-]+|الأرضي|أرضي|الاول|الأول|الثاني|الثالث|الرابع|الخامس)/gi, (all, v) => {
    if (/^(?:الدور|الطابق|floor)/i.test(all)) floor = v.trim(); else flat = v.trim();
    return '';
  });
  const key = s => s.trim().replace(/^(?:محافظة|governorate)\s+/i, '').toLowerCase();
  const redundant = new Set(['مصر', 'egypt', 'القاهرة', 'cairo', 'الجيزة', 'giza', key(zone)]);
  return { floor, flat, street: street.split(/[،,;؛\n—]+/).map(s => s.trim()).filter(s => s && !redundant.has(key(s))).join('، ') };
}
// Talabat's own lines about the customer's plan («طلبات برو»، «توصيل مجاني»، «Talabat Pro customer») are not instructions
// for the kitchen: they never go into the order's comment (Karim 11-11), wherever they sit in the note.
// Karim 11-11 (Apex notes «[تبرو فري دليفري].»): Talabat writes «[tPro free delivery].», and the Arabic of it is caught too.
const PLAN = String.raw`(?:talabat\s*pro|(?<![\p{L}])t\s*-?\s*pro(?![\p{L}])|طلبات\s*برو|(?<![\p{L}])(?:تي\s*)?برو(?![\p{L}])|(?<![\p{L}])تبرو(?![\p{L}])|talabat\s*plus|طلبات\s*بلس)`;
const FREE = String.raw`(?:free\s*delivery|توصيل\s*مجان[يى]|فر[يى]\s*د[يى]?ل[يى]فر[يى]|د[يى]?ل[يى]فر[يى]\s*مجان[يى])`;
const PRO = new RegExp(String.raw`(?:عميل\s*)?${PLAN}(?:\s*(?:customer|member|subscriber|عميل|مشترك))?(?:\s*[-–:：|،,]?\s*${FREE})?|${FREE}(?:\s*(?:for|ل|لـ)\s*${PLAN}(?:\s*(?:customers?|عملاء))?)?`, 'giu');
export function stripPlatformNotes(s) {
  return String(s || '').replace(PRO, ' ').replace(/[\[(]\s*[.\s]*[\])]\s*\.?/g, ' ').replace(/^[\s.]+$/, '').replace(/\s*([|،,\-–:])\s*(?=[|،,]|$)/g, '').replace(/^[\s|،,\-–:]+|[\s|،,\-–:]+$/g, '').replace(/\s{2,}/g, ' ').trim();
}
export function deliveryComment(order) {
  const clean = s => String(s || '').split(/\s*[|\n]\s*/).map(stripPlatformNotes).filter(Boolean).join('، ').trim();
  const parts = [clean(order.note)];
  for (const [n, item] of (order.items || []).entries()) {
    const free = [...new Set((item.freeOptions || []).map(clean).filter(Boolean))];
    if (free.length) parts.push((order.items.length > 1 ? 'الصنف ' + (n + 1) + ': ' : '') + free.join('، '));
    if (item.note) parts.push(clean(item.note));
  }
  return [...new Set(parts.filter(Boolean))].join(' | ');
}
