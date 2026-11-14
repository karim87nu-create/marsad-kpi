// Presentation fields never replace the conservative customer matching keys.
export function deliveryPhone(value) {
  let s = String(value || '').trim().replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c >= '۰' ? 0x6f0 : 0x660)));
  if (/[x*•…]/i.test(s)) return '';
  s = s.replace(/[\s().-]/g, '').replace(/^00/, '+');
  if (/^\+?201[0125]\d{8}$/.test(s)) s = '0' + s.replace(/^\+?20/, '');
  return /^\+?\d{7,15}$/.test(s) ? s : '';
}
export function deliveryLabel(name, source, payment, code, appointment = '') {
  const tag = String(code || '').replace(/\D/g, '').slice(0, 10);
  const suffix = '/' + (source === 'talabat' ? 'طلبات' : 'موقع') + '/' + (payment === 'paid' ? 'مدفوع' : payment === 'cash' ? 'كاش' : '؟') + (tag ? '/#' + tag : '');
  const clean = String(name || 'عميل').replace(/#\s*\d+/g, '').replace(/\s+/g, ' ').trim() || 'عميل';
  const booking = appointment ? '/' + appointment : '';
  return clean.slice(0, Math.max(0, 50 - suffix.length - booking.length)).trim() + booking + suffix;
}

export function deliveryNotes(value, scheduledAt = null) {
  const western = s => String(s).replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c>='۰'?0x6f0:0x660)));
  const at = typeof scheduledAt === 'number' ? scheduledAt : Date.parse(scheduledAt || '');
  let appointment = '', clock = '', dates = [];
  if (Number.isFinite(at) && at > 0) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)).map(p=>[p.type,p.value]));
    const hour=Number(parts.hour);clock=(hour%12||12)+':'+parts.minute+(hour>=12?'م':'ص');
    appointment='حجز '+parts.day+'/'+parts.month+' '+clock;
    const year=new Intl.DateTimeFormat('en',{timeZone:'Africa/Cairo',year:'numeric'}).format(new Date(at));
    dates=[`${Number(parts.day)}/${Number(parts.month)}`,`${Number(parts.day)}/${Number(parts.month)}/${year}`,`${year}/${Number(parts.month)}/${Number(parts.day)}`];
  }
  const note = String(value || '').split(/[|\n،]+/).filter(part=>{
    const text=western(part).trim();
    // Only standalone appointment metadata. Never consume cooking/delivery instructions.
    const m=text.match(/^(?:(?:موعد|ميعاد)\s*(?:التوصيل|الاستلام|الحجز)?|حجز|scheduled\s*(?:delivery|pickup)?|delivery\s*time)\s*[:：-]?\s*(?:(\d{1,4}[\/.\-]\d{1,2}(?:[\/.\-]\d{1,4})?)\s*)?(?:الساعة\s*)?(\d{1,2})(?::(\d{2}))?\s*(ص|م|am|pm)\s*$/i);
    if(!m || Number(m[2])<1 || Number(m[2])>12 || Number(m[3]||0)>59)return true;
    const time=Number(m[2])+':'+(m[3]||'00')+(/^(م|pm)$/i.test(m[4])?'م':'ص');
    if(clock && clock!==time)return true; // Keep a conflicting instruction for staff review.
    if(m[1] && dates.length && !dates.includes(m[1].split(/[/.\-]/).map(Number).join('/')))return true;
    if(!appointment)appointment='حجز '+(m[1]?m[1]+' ':'')+time;
    clock=time;
    return false;
  }).join(' | ').trim();
  return {note,appointment};
}

export function cleanOptionComment(value) {
  const s=String(value || '').trim();
  const heading='(?:اختيارات?|خيارات?|اختيار)\\s+(?:السلط[ةه]|السلطات|الأرز|الارز|العيش|الخبز|الصوص|الإضافات|الاضافات)';
  if(new RegExp('^'+heading+'\\s*[:：]?\\s*$','i').test(s))return '';
  if(!/بدون|من غير|حساسي|لا |كلم|اتصل|بدل|زيادة/.test(s) && new RegExp('^[^:：]{1,80}[:：]\\s*'+heading+'\\s*[:：]?\\s*$','i').test(s))return '';
  return s.replace(new RegExp('(^|[:：]\\s*)'+heading+'\\s*[:：]\\s*','i'),'$1');
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
export function splitDeliveryAddress(value, max = 100) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  let main = '';
  while (words.length) {
    const next = words[0], size = Array.from(main ? main + ' ' + next : next).length;
    if (size > max) break;
    main = main ? main + ' ' + words.shift() : words.shift();
  }
  return { main, extra: words.join(' ') };
}
export function deliveryMark(sign, extra = '', max = 50) {
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
// Keep Apex's limited comment field useful: remove polite/duplicate wording first, then
// preserve instruction-like clauses ahead of general remarks if the source is still long.
export function compactDeliveryComment(value, max = 200) {
  const clean = text => cleanOptionComment(stripPlatformNotes(text))
    .replace(/(?:من\s+فضلكم?|لو\s+سمحت(?:وا)?|برجاء|يرجى|نرجو|الرجاء|ملاحظة\s+العميل|تعليق\s+العميل|please|kindly|thank\s+you|thanks)/giu, ' ')
    .replace(/[✅⭐️✨🙏😊🙂👍🔥📞📍💬]/gu, ' ')
    .replace(/\s+/gu, ' ').replace(/^[\s:：|،,؛;.!؟-]+|[\s:：|،,؛;.!؟-]+$/gu, '').trim();
  const parts = [...new Set(String(value || '').replace(/\r/g, '\n').split(/[|\n،,؛;]+|(?<=[.!؟])\s+/u).map(clean).filter(Boolean))];
  if (!parts.length) return '';
  const count = text => [...text].length;
  const priority = /(?:بدون|من\s+غير|بدل|زيادة|إضافة|اضافة|شيل|احذف|استبدل|متحطش|ما\s+تحطش|عايز|محتاج|حساسية|لا\s+يوضع|no\b|without\b|instead\b|extra\b|add\b|remove\b|allerg|replace\b)/iu;
  const ranked = parts.map((text, i) => ({ text, i, priority: priority.test(text) ? 0 : 1 }))
    .sort((a, b) => a.priority - b.priority || a.i - b.i);
  const selected = new Set(), chosen = [];
  for (const item of ranked) {
    const candidate = [...chosen, item];
    const length = candidate.reduce((n, x) => n + count(x.text), 0) + Math.max(0, candidate.length - 1) * 3;
    if (length <= max) { chosen.push(item); selected.add(item.i); }
  }
  if (!chosen.length) {
    const first = ranked[0].text, words = first.split(/\s+/u), kept = [];
    for (const word of words) {
      const next = [...kept, word].join(' ');
      if (count(next) > max) break;
      kept.push(word);
    }
    return kept.join(' ');
  }
  return parts.filter((_, i) => selected.has(i)).join(' | ');
}
export function deliveryComment(order) {
  const clean = s => String(s || '').split(/\s*[|\n]\s*/).map(stripPlatformNotes).map(cleanOptionComment).filter(Boolean).join('، ').trim();
  const parts = [clean(order.scheduledAt ? deliveryNotes(order.note,order.scheduledAt).note : order.note)];
  for (const [n, item] of (order.items || []).entries()) {
    const free = [...new Set((item.freeOptions || []).map(clean).filter(Boolean))];
    // A website dish by its own (short) name, not «الصنف ١» (11-11: the Apex notes read «الصنف ١: خبز بلدي»).
    const label = order.source === 'site' ? String(item.name || '').split(/\s+/).slice(0, 3).join(' ') : 'الصنف ' + (n + 1);
    if (free.length) parts.push((order.items.length > 1 || order.source === 'site' ? label + ': ' : '') + free.join('، '));
    if (item.note) parts.push(clean(item.note));
  }
  return [...new Set(parts.filter(Boolean))].join(' | ');
}
