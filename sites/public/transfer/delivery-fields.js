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
  // «/» and «\» are the label's own separators (Apex showed «// ///طلبات/مدفوع/#5223», 11-14): never inside the name.
  const clean = apexText(String(name || '')).replace(/#\s*\d+/g, '').replace(/[\\/]+/g, ' ').replace(/^[\s.\-_|،,]+|[\s.\-_|،,]+$/g, '').replace(/\s+/g, ' ').trim() || 'عميل';
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

// Apex keeps Arabic in the Windows Arabic code page: letters outside it (ڤ چ گ پ, Persian ی ک), direction marks and
// emoji came out as «?» (Apex 11-14: «?يلا 205»). Every text written to Apex goes through this.
export function apexText(value) {
  return String(value ?? '').normalize('NFC')
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/ڤ/g, 'ف').replace(/چ/g, 'ج').replace(/[گک]/g, 'ك').replace(/پ/g, 'ب').replace(/ژ/g, 'ز').replace(/ی/g, 'ي').replace(/ۀ/g, 'ه')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{20E3}]/gu, ' ')
    .replace(/[ \t]{2,}/g, ' ').trim();
}

// The address the branch reads on Apex (Karim 11-14: «اول العنوان هو اكتر حاجه مفيده لأنه اللي بيظهر للفرع»):
//  - the building first (عمارة / فيلا / مجموعة / «مبنى:» of Talabat), then the street, then the rest, landmarks last;
//  - floor and flat in their own fields, never their empty labels («الدور:، الشقة:») in the address;
//  - no city / governorate / the Apex area's own name, no repeated parts, no lone numbers left from a split area name.
const BUILDING = /(?:عمار[ةه]|فيلا|ڤيلا|مجموع[ةه]|بلوك|برج|مبنى|مبني|building|bldg|villa|block|tower)/i;
const LANDMARK = /^(?:بجوار|جنب|امام|أمام|قدام|خلف|ورا|وراء|بعد|قبل|بالقرب|قريب|عند|في\s+وش|near|next\s+to|behind|in\s+front|opposite|beside)/i;
const STREET = /(?:^|\s)(?:شارع|ش\.?|طريق|محور|street|st\.?|road|rd\.?)(?:\s|$)/i;
const FLOOR_WORDS = '(?:الأرضي|الارضي|الارضى|أرضي|ارضي|ارضى|البيزمنت|بيزمنت|بدروم|البدروم|الروف|روف|الاول|الأول|الثاني|التاني|الثالث|التالت|الرابع|الخامس|السادس|السابع|الثامن|التامن|التاسع|العاشر)';
export function deliveryAddress(value, zone = '') {
  let floor = '', flat = '';
  const key = s => String(s || '').trim().replace(/^(?:محافظة|governorate|منطقة|المنطقة|district|area)\s*[:：]?\s*/i, '')
    .normalize('NFKD').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const areas = (Array.isArray(zone) ? zone : [zone]).map(s => String(s || '').trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  const redundant = new Set(['مصر', 'egypt', 'القاهرة', 'القاهره الجديده', 'cairo', 'new cairo', 'الجيزة', 'giza', 'جمهورية مصر العربية'].map(key));
  const withoutArea = value => {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    for (const area of areas) {
      const count = area.split(/\s+/).filter(Boolean).length;
      if (count && words.length > count && key(words.slice(0, count).join(' ')) === key(area)) words.splice(0, count);
      else if (count && words.length > count && key(words.slice(-count).join(' ')) === key(area)) words.splice(-count, count);
      else if (count && key(words.join(' ')) === key(area)) return '';
    }
    return words.join(' ');
  };
  // Floor and flat said inside a part («مجموعة 45 عمارة 5 شقة 32», «الدور: الارضي»), then labelled parts.
  const val = '([\\d٠-٩۰-۹]+[A-Za-z\\u0621-\\u064a]?|[A-Za-z]\\d*|' + FLOOR_WORDS + ')';
  let text = apexText(value)
    .replace(new RegExp('(?:الدور|الطابق|دور|floor)\\s*[:：]?\\s*' + val + '(?![\\p{L}\\p{N}])', 'giu'), (all, v) => { if (!floor) floor = v.trim(); return ' '; })
    .replace(new RegExp('(?:الشقة|الشقه|شقة|شقه|apartment|apt\\.?|flat)\\s*[:：]?\\s*' + val + '(?![\\p{L}\\p{N}])', 'giu'), (all, v) => { if (!flat) flat = v.trim(); return ' '; });
  const parts = [];
  for (let seg of text.split(/[،,;؛\n—|]+/)) {
    seg = seg.replace(/^[\s.\-–:：]+|[\s.\-–:：]+$/g, '').replace(/\s+/g, ' ').trim();
    if (!seg) continue;
    // A label with nothing after it («الدور:», «الشقة:»): nothing to keep.
    if (/^(?:الدور|الطابق|دور|الشقة|الشقه|شقة|شقه|floor|flat|apartment|apt)\s*[:：]?$/i.test(seg)) continue;
    let building = false;
    const lab = seg.match(/^(?:مبنى|مبني|building|bldg)\s*[:：]?\s*(.+)$/i);
    if (lab) { seg = /^[\d٠-٩]/.test(lab[1]) ? 'عمارة ' + lab[1] : lab[1]; building = true; }
    seg = withoutArea(seg);
    if (!seg || redundant.has(key(seg))) continue;
    if (/^[\d٠-٩]{1,2}$/.test(seg)) continue;   // «البنفسج 1، 2، 3، 4» split on its commas
    parts.push({ seg, building });
  }
  // No part twice (the same words, or a part already inside a longer one).
  const kept = [];
  for (const p of [...parts].sort((a, b) => key(b.seg).length - key(a.seg).length)) {
    const k = key(p.seg);
    if (!k || kept.some(q => key(q.seg) === k || (k.length >= 3 && (' ' + key(q.seg) + ' ').includes(' ' + k + ' ')))) continue;
    kept.push(p);
  }
  const order = new Map(parts.map((p, i) => [p, i]));
  // Talabat's «مبنى:» part is the building even without a number («مبنى: سكان مصر»).
  const rank = p => LANDMARK.test(p.seg) ? 0 : (BUILDING.test(p.seg) || p.building) && /[\d٠-٩]/.test(p.seg) ? 3 : p.building ? 2.5 : /^[\d٠-٩]/.test(p.seg) ? 2 : STREET.test(p.seg) ? 1.5 : 1;
  kept.sort((a, b) => rank(b) - rank(a) || order.get(a) - order.get(b));
  return { floor: apexText(floor), flat: apexText(flat), street: kept.map(p => p.seg).join('، ') };
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

// The comment the kitchen and the branch read (Karim 11-14: «التعليقات خصوصا علي الموقع بتكتب بطريقه غريبه»):
//  - the customer's own words first; the website's «مصدر الطلب» / «فرع الاستلام» lines are not for the kitchen;
//  - each dish's free choices as «الصنف: الاختيار ×2» — the dish's short name (website) or «الصنف ٢» (Talabat, only when
//    more than one dish has choices), never the choice group's heading («اختيارات السلطة المجانية:») or «(ضمن الوجبة)».
const SITE_META = /^(?:فرع\s+الاستلام|طريقة\s+(?:الاستلام|التوصيل|الدفع)|نوع\s+الطلب|وقت\s+الطلب)\s*[:：]/;
function cleanChoice(value) {
  return cleanOptionComment(String(value || ''))
    .replace(/[(\[]\s*(?:ضمن\s+(?:الوجب[ةه]|العرض|الكومبو)|مجان[يا]|مجانًا|free)\s*[)\]]/giu, ' ')
    .replace(/\s+(?:ضمن\s+(?:الوجب[ةه]|العرض|الكومبو))\s*$/u, '')
    // Any choice-group heading before the choice: «اختيارات السلطة المجانية: طحينة» → «طحينة».
    .replace(/^(?:[^:：]{0,40}[:：]\s*)?(?:اختيارات?|خيارات?|اختيار|نوع)\s+[^:：]{1,40}[:：]\s*/u, '')
    .replace(/\s*[x×]\s*(\d+)/giu, ' ×$1')
    .replace(/\s{2,}/g, ' ').replace(/^[\s:：،,|-]+|[\s:：،,|-]+$/g, '').trim();
}
export function deliveryComment(order) {
  const clean = s => String(s || '').split(/\s*[|\n]\s*/).map(stripPlatformNotes).map(cleanOptionComment)
    .filter(x => x && !SITE_META.test(x)).join('، ').trim();
  const parts = [clean(order.scheduledAt ? deliveryNotes(order.note, order.scheduledAt).note : order.note)];
  const items = order.items || [];
  const withChoices = items.filter(i => (i.freeOptions || []).some(v => cleanChoice(v))).length;
  for (const [n, item] of items.entries()) {
    const free = [...new Set((item.freeOptions || []).map(v => cleanChoice(stripPlatformNotes(v))).filter(Boolean))];
    const short = String(item.name || '').replace(/[()\[\]]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
    const label = order.source === 'site' && short ? short : withChoices > 1 ? 'الصنف ' + (n + 1) : '';
    if (free.length) parts.push((label ? label + ': ' : '') + free.join('، '));
    if (item.note) parts.push(clean(item.note));
  }
  return apexText([...new Set(parts.filter(Boolean))].join(' | '));
}
