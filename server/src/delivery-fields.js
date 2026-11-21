// Presentation fields never replace the conservative customer matching keys.
export function deliveryPhone(value) {
  let s = String(value || '').trim().replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c >= '۰' ? 0x6f0 : 0x660)));
  if (/[x*•…]/i.test(s)) return '';
  s = s.replace(/[\s().-]/g, '').replace(/^00/, '+');
  if (/^\+?201[0125]\d{8}$/.test(s)) s = '0' + s.replace(/^\+?20/, '');
  return /^\+?\d{7,15}$/.test(s) ? s : '';
}
export function deliveryCustomerName(value) {
  const name = apexText(value).replace(/#\s*[0-9٠-٩۰-۹]+/g, '').replace(/^[\s.\-_/|،,]+|[\s.\-_/|،,]+$/g, '').trim();
  return /\p{L}/u.test(name) && !/^(?:information|details|customer|customer name|unknown|unnamed|n[ /]?a|none|null|undefined|guest|test|العميل|اسم العميل|غير معروف|بدون اسم|زائر)$/i.test(name) ? name : '';
}
export function deliveryLabel(name, source, payment, code, appointment = '') {
  const tag = String(code || '').replace(/\D/g, '').slice(0, 10);
  const suffix = '/' + (source === 'talabat' ? 'طلبات' : 'موقع') + '/' + (payment === 'paid' ? 'مدفوع' : payment === 'cash' ? 'كاش' : '؟') + (tag ? '/#' + tag : '');
  // «/» and «\» are the label's own separators (Apex showed «// ///طلبات/مدفوع/#5223», 11-14): never inside the name.
  const clean = deliveryCustomerName(name).replace(/[\\/]+/g, ' ').replace(/^[\s.\-_|،,]+|[\s.\-_|،,]+$/g, '').replace(/\s+/g, ' ').trim() || 'عميل';
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
    // «الموعد المطلوب: 2026-11-20T15:00» (the central panel's own words): the appointment, not a note for the kitchen.
    const iso=text.match(/^الموعد\s+المطلوب\s*[:：]?\s*(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/);
    if(iso){ if(!appointment){ const h=Number(iso[4]); appointment='حجز '+Number(iso[3])+'/'+Number(iso[2])+' '+(h%12||12)+':'+iso[5]+(h>=12?'م':'ص'); } return false; }
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
  // Karim 11-14 (Apex 702803: «نص فرخة مشوية: اختيارات السلطة المجانية: طحينة (ضمن الوجبة)»): «المجانية» after the
  // heading and «(ضمن الوجبة)» after the choice are the website's words, not the kitchen's.
  const heading='(?:اختيارات?|خيارات?|اختيار)\\s+(?:السلط[ةه]|السلطات|الأرز|الارز|العيش|الخبز|الصوص|الإضافات|الاضافات)(?:\\s+(?:المجاني[ةه]|مجاني[ةه]?|المجانا))?';
  if(new RegExp('^'+heading+'\\s*[:：]?\\s*$','i').test(s))return '';
  if(!/بدون|من غير|حساسي|لا |كلم|اتصل|بدل|زيادة/.test(s) && new RegExp('^[^:：]{1,80}[:：]\\s*'+heading+'\\s*[:：]?\\s*$','i').test(s))return '';
  return s.replace(new RegExp('(^|[:：]\\s*)'+heading+'\\s*[:：]\\s*','i'),'$1')
    .replace(/\s*[(\[]\s*(?:ضمن\s+(?:الوجب[ةه]|العرض|الكومبو)|مجان[يا]|مجانًا)\s*[)\]]/gu,'').replace(/\s*[x×]\s*(\d+)/giu,' ×$1').replace(/ ×1(?!\d)/g,'').trim();
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
//  - compound, then the main street and building, with landmarks handled separately;
//  - floor and flat in their own fields, never their empty labels («الدور:، الشقة:») in the address;
//  - no city / governorate / the Apex area's own name, no repeated parts, no lone numbers left from a split area name.
const BUILDING = /(?:عمار[ةه]|فيلا|ڤيلا|مجموع[ةه]|بلوك|برج|مبنى|مبني|building|bldg|villa|block|tower)/i;
const LANDMARK = /^(?:بجوار|بجانب|جانب|جنب|امام|أمام|قدام|خلف|ورا|وراء|بعد|قبل|بالقرب|قريب|عند|في\s+وش|near|next\s+to|behind|in\s+front|opposite|beside)/i;
const PLACE = /(?:^|\s)(?:كمباوند|كومباوند|كمبوند|كومبوند|compound|مول|mall|ابراج|أبراج|دار\s+مصر|سكن\s+مصر|سكان\s+مصر|مساكن|مدين[ةه]|حي|الحي|مجاور[ةه]|المجاور[ةه]|المحلي[ةه]|محلي[ةه]|منطق[ةه]|المنطق[ةه]|مرحل[ةه]|المرحل[ةه]|عمارات|تاون|town|ريزيدنس|residence|بارك|park|هايتس|heights|فيلدج|village|قري[ةه]|كومباوند|جاردن|gardens?|سيتي|city|بلازا|plaza)(?:\s|$)/i;
const COMPOUND = /^(?:ال)?(?:كمباوند|كومباوند|كمبوند|كومبوند|compound)(?=\s|[:：]|$)/i;
const KNOWN_COMPOUND = /^(?:ماونتن فيو|هايد بارك|ميفيدا|ذا ووتر واي|ووتر واي|سوديك إيست تاون|سوديك ايست تاون|بالم هيلز|قطامية ديونز|تاج سيتي|تاج سلطان|جاردينيا سيتي)(?=\s|$)/i;
const MAIN_ROAD = /^(?:طريق|محور)\s+|(?:^|\s)(?:التسعين|الدائري|المحور|محور|الطريق|الكورنيش|كورنيش|ميدان|الأوتوستراد|الاوتوستراد)(?:\s|$)/;
const MAIN_STREET_LABEL = /^(?:الشارع الرئيسي|الطريق الرئيسي|شارع رئيسي|main street|main road|primary street)\s*[:：]\s*/i;
const STREET = /(?:^|\s)(?:شارع|ش\.?|طريق|محور|street|st\.?|road|rd\.?)(?:\s|$)/i;
const FLOOR_WORDS = '(?:الأرضي|الارضي|الارضى|أرضي|ارضي|ارضى|البيزمنت|بيزمنت|بدروم|البدروم|الروف|روف|الاول|الأول|الثاني|التاني|الثالث|التالت|الرابع|الخامس|السادس|السابع|الثامن|التامن|التاسع|العاشر)';
const addressKey = s => String(s || '').trim().replace(/^(?:محافظة|governorate|منطقة|المنطقة|district|area)\s*[:：]?\s*/i, '')
    .normalize('NFKD').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase()
    .replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c >= '۰' ? 0x6f0 : 0x660)))
    .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
const areaBase = s => String(s || '').trim().replace(/\s+(?:طلبات|الموقع|موقع|اونلاين|أونلاين|talabat|online)$/i, '');
// Keep areas and concrete destinations separate when a source supplies both address text and named fields.
export function withDeliveryPlaces(address, { compound, mainStreet, street } = {}) {
  const text = typeof address === 'string' ? address.trim() : '';
  const label = (name, value, pattern) => value && value !== '0' ? (pattern.test(value) ? value : name + value) : '';
  const place = label('كمبوند ', compound, COMPOUND);
  const road = label('الشارع الرئيسي: ', mainStreet, MAIN_STREET_LABEL);
  const local = label('شارع ', street, /^(?:شارع|ش\.?|طريق|محور|street|road)(?=\s|[:：])/i);
  const segments = text.split(/[،,;؛—|\n]/).map(addressKey);
  const missing = value => value && !segments.includes(addressKey(value));
  const entries = [place, road, local].filter(missing);
  return [...new Set(entries), text].filter(Boolean).join(' — ');
}
export function deliveryAddress(value, zone = '') {
  const key = addressKey;
  // The Apex area's name also without its «طلبات»/«الموقع» ending («التجمع الخامس طلبات» → «التجمع الخامس»).
  const areas = [...new Set((Array.isArray(zone) ? zone : [zone]).map(s => String(s || '').trim()).filter(Boolean).flatMap(s => [s, areaBase(s)]))].filter(Boolean).sort((a, b) => b.length - a.length);
  const redundant = new Set(['مصر', 'egypt', 'القاهرة', 'القاهره الجديده', 'cairo', 'new cairo', 'الجيزة', 'giza', 'جمهورية مصر العربية'].map(key));
  const geoStart = /^(?:شارع|ش\.?|طريق|محور|عمارة|عماره|مبنى|برج|فيلا|كمبوند|كومباوند|مجموعة|بلوك|بوابة|street|road|building|villa|compound|gate)(?=\s|[:：])/i;
  const withoutArea = value => {
    if (COMPOUND.test(value) || MAIN_STREET_LABEL.test(value) || LANDMARK.test(value)) return value;
    if (areas.some(area => key(value) === key(area))) return '';
    const words = value.split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const rest = words.slice(i).join(' ');
      if (geoStart.test(rest) && areas.some(area => key(words.slice(0, i).join(' ')) === key(area))) return rest;
    }
    return value;
  };
  const label = /^(?:علام[ةه]\s+مميز[ةه]|landmark|nearest landmark|directions?)\s*[:：]?\s*(.*)$/iu;
  const floorLabel = '(?:الدور|الطابق|دور|floor)';
  const flatLabel = '(?:الشقة|الشقه|شقة|شقه|apartment|apt\\.?|flat)';
  const digit = '[0-9٠-٩۰-۹]';
  const number = '[+-]?' + digit + '+[A-Za-z\\u0621-\\u064a]?';
  const code = '(?:[A-Za-z]?' + number + '(?:[-–/]?[A-Za-z0-9٠-٩۰-۹]+)*|[A-Za-z](?:[-–/][A-Za-z0-9٠-٩۰-۹]+)*)';
  const field = name => new RegExp('(?:^|[\\s(])(' + name + ')(?=\\s|[:：]|[0-9٠-٩۰-۹])\\s*([:：]?)\\s*(' + FLOOR_WORDS + '|' + code + ')(?![\\p{L}\\p{N}/-])', 'giu');
  const floorField = field(floorLabel), flatField = field(flatLabel);
  const found = { floor: [], flat: [] }, marks = [], pieces = [];
  let inMark = false;
  const standalone = new RegExp('^(?:' + floorLabel + '|' + flatLabel + ')(?=\\s|[:：]|[0-9٠-٩۰-۹])', 'iu');
  const scan = apexText(value).split(/([،,;؛\n—|]+|\s+[-–]\s+|\s*\/\s*(?=[\u0621-\u064a]))/);
  for (let i = 0; i < scan.length; i++) {
    if (i % 2) {
      if (/[^،,\s]|\n/u.test(scan[i])) inMark = false;
      continue;
    }
    const segment = scan[i].trim(), explicit = segment.match(label);
    if (explicit) {
      marks.push(explicit[1]);
      inMark = true;
      continue;
    }
    if (!segment) continue;
    if (inMark && !standalone.test(segment)) { marks[marks.length - 1] = [marks.at(-1), segment].filter(Boolean).join('، '); continue; }
    inMark = false;
    // Keep inline directions intact for the landmark pass; their house or flat is a reference.
    if (LANDMARK.test(segment)) { pieces.push(segment); continue; }
    const embedded = splitAddressLandmark(segment);
    const address = embedded.landmark ? embedded.street : segment;

    const extract = (pattern, values, input) => input.replace(pattern, (all, _name, colon, value) => {
      values.push({ value, rank: colon ? 2 : 1 });
      return ' ';
    });
    pieces.push(extract(flatField, found.flat, extract(floorField, found.floor, address)));
    if (embedded.landmark) pieces.push(embedded.landmark);
  }
  const fieldValue = values => {
    const ranked = values.filter(x => x.value !== '0').sort((a, b) => b.rank - a.rank);
    const best = ranked[0];
    return { value: best?.value || '', conflict: !!best && ranked.some(x => x.rank === best.rank && key(x.value) !== key(best.value)) };
  };
  const floorFieldValue = fieldValue(found.floor), flatFieldValue = fieldValue(found.flat);
  const floor = floorFieldValue.value, flat = flatFieldValue.value;
  const parts = [], segments = pieces
    .map(seg => seg.replace(/^[\s.\-–:：\/]+|[\s.\-–:：\/]+$/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const areaSeries = new Set();
  for (let i = 0; i < segments.length; i++) {
    if (!/\d$/.test(key(segments[i])) || withoutArea(segments[i])) continue;
    let end = i + 1;
    while (/^[\d٠-٩]{1,2}$/.test(segments[end] || '')) end++;
    if (end - i > 3) for (let j = i + 1; j < end; j++) areaSeries.add(j);
  }
  for (let [i, seg] of segments.entries()) {
    if (areaSeries.has(i)) continue;
    if (!seg) continue;
    // Karim 11-19 review: Talabat's «طريق بدون اسم» (unnamed road) says nothing.
    if (/^(?:طريق|شارع|ش)\s+(?:بدون|بلا|من غير)\s+اسم$|^unnamed road$/i.test(seg)) continue;
    // A label with nothing after it («الدور:», «الشقة:»): nothing to keep.
    if (/^(?:الدور|الطابق|دور|الشقة|الشقه|شقة|شقه|floor|flat|apartment|apt)\s*[:：]?$/i.test(seg)) continue;
    let building = false;
    const lab = seg.match(/^(?:مبنى|مبني|building|bldg)\s*[:：]?\s*(.+)$/i);
    if (lab && /^[\s0٠\-–.]*$/.test(lab[1])) continue;   // «مبنى: 0»: no building
    if (lab) { seg = /^(?:[\d٠-٩۰-۹]|[A-Za-z][-–]?\d)/.test(lab[1]) ? 'عمارة ' + lab[1] : lab[1]; building = true; }
    seg = withoutArea(seg);
    if (!seg || redundant.has(key(seg))) continue;
    const mainStreet = MAIN_STREET_LABEL.test(seg);
    if (mainStreet) {
      const road = seg.replace(MAIN_STREET_LABEL, '');
      seg = !road || STREET.test(road) || MAIN_ROAD.test(road) ? road : 'شارع ' + road;
    }
    if (!seg) continue;
    parts.push({ seg, building, mainStreet, compound: COMPOUND.test(seg) || KNOWN_COMPOUND.test(seg) });
  }
  // No part twice (the same words, or a part already inside a longer one).
  const kept = [];
  for (const p of [...parts].sort((a, b) => Number(b.compound || b.mainStreet) - Number(a.compound || a.mainStreet) || key(b.seg).length - key(a.seg).length)) {
    const k = key(p.seg);
    // A building part also counts without its «عمارة» word («عمارة 244 الاندلس 1» when the street starts «244 الاندلس 1 - …»).
    const k2 = p.building ? key(p.seg.replace(/^عمار[ةه]\s+/, '')) : k;
    if (p.building && /^[\d٠-٩]+[a-z\u0621-\u064a]?$/i.test(k2)) {
      const buildingNumber = new RegExp('(?:^|\\s)' + BUILDING.source + '\\s+(?:رقم\\s+)?' + k2 + '(?=\\s|$)', 'i');
      if (parts.some(q => q !== p && (key(q.seg).startsWith(k2 + ' ') || buildingNumber.test(key(q.seg))))) continue;
    }
    if (!k || kept.some(q => {
      if (LANDMARK.test(q.seg) !== LANDMARK.test(p.seg)) return false;
      const qKey = key(q.seg);
      if (qKey === k) return true;
      if (p.compound && q.compound && key(p.seg.replace(COMPOUND, '')) === key(q.seg.replace(COMPOUND, ''))) return true;
      if (p.compound || p.mainStreet || STREET.test(p.seg) || MAIN_ROAD.test(p.seg)) return false;
      return (k.length >= 3 && (' ' + qKey + ' ').includes(' ' + k + ' ')) ||
        (k2 !== k && k2.length >= 3 && (' ' + qKey + ' ').includes(' ' + k2 + ' '));
    })) continue;
    kept.push(p);
  }
  const order = new Map(parts.map((p, i) => [p, i]));
  // Karim 11-14: first the place inside the Apex area (a compound, a district, a mall…) or the main street, then the building,
  // then the rest; landmarks («بجوار…») last.
  const rank = p => LANDMARK.test(p.seg) ? 0 : p.compound ? 6 : p.mainStreet || MAIN_ROAD.test(p.seg) ? 5 : PLACE.test(p.seg) && !STREET.test(p.seg) ? 4 : STREET.test(p.seg) ? 3
    // A name with no number and no building word is usually the street or the place («عبد الرحمن صدقي، مبنى: 31»).
    : (BUILDING.test(p.seg) || p.building) && /[\d٠-٩]/.test(p.seg) ? 2 : !/[\d٠-٩]/.test(p.seg) && !BUILDING.test(p.seg) ? 2.5 : p.building ? 1.5 : /^[\d٠-٩]/.test(p.seg) ? 1.5 : 1;
  kept.sort((a, b) => rank(b) - rank(a) || order.get(a) - order.get(b));
  return { floor: apexText(floor), flat: apexText(flat), street: kept.map(p => p.seg).join('، '), ...(marks.filter(Boolean).length ? { mark: apexText(marks.filter(Boolean).join('/')) } : {}), ...(floorFieldValue.conflict || flatFieldValue.conflict ? { conflict: true } : {}) };
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
    .replace(/ ×1(?!\d)/g, '')
    .replace(/\s{2,}/g, ' ').replace(/^[\s:：،,|-]+|[\s:：،,|-]+$/g, '').trim();
}
// Common free sides as the kitchen says them, short (the receipt has room for one line).
// Never two things to one word («سلطة بلدي» and «عيش بلدي» stay apart).
// Karim 11-19 «لو حاطط حاجه تخص موضوع التعليق علي الأصناف ده شيلها ونا هظبطها من صفحه الاداره»: no built-in rewording of
// the dishes' choices. The replacements are «الإدارة ← إعدادات التشغيل ← كلام الأصناف», applied on the server for every order.
const shortChoice = v => String(v || '').trim();
const normWord = t => String(t || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\u064b-\u065f\u0640]/g, '');
const escRe = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// pairs: [{ from, to }] from the admin page; whole words, ة/ه and ى/ي alike. Only the dishes' choice pieces
// («الصنف 1: سلطة طحينة», or a piece of 3 words or less) — never the customer's own sentences.
export function applyChoiceWords(text, pairs) {
  const list = (Array.isArray(pairs) ? pairs : []).filter(x => x && String(x.from || '').trim());
  if (!list.length) return String(text || '');
  const one = p => { let x = p; for (const { from, to } of list) {
    const pat = normWord(String(from).trim()).split(/\s+/).map(w => escRe(w).replace(/ا/g, '[اأإآ]').replace(/ه/g, '[هة]').replace(/ي/g, '[يى]')).join('\\s+');
    x = x.replace(new RegExp('(^|[\\s:،,/|(])' + pat + '(?=$|[\\s:،,/|)×])', 'gu'), (m, pre) => pre + String(to || '').trim()); }
    return x.replace(/\s{2,}/g, ' ').trim(); };
  return String(text || '').split(/\s*\|\s*/).map(p => /^[^:：]{1,30}[:：]\s/.test(p) || p.split(/\s+/).length <= 3 ? one(p) : p).join(' | ');
}
export function deliveryComment(order) {
  const nk = x => x.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();
  const clean = s => { const seen = new Set(); return String(s || '').split(/\s*[|\n]\s*/).map(stripPlatformNotes).map(cleanOptionComment)
    .filter(x => x && !SITE_META.test(x) && !seen.has(nk(x)) && seen.add(nk(x))).join('، ').trim(); };
  const parts = [clean(order.scheduledAt ? deliveryNotes(order.note, order.scheduledAt).note : order.note)];
  const items = order.items || [];
  const withChoices = items.filter(i => (i.freeOptions || []).some(v => cleanChoice(v))).length;
  // The dish's label: the Apex item it goes as (the same for Talabat's English names and the website's Arabic ones).
  const apexName = item => { const pick = item.apexPick || (item.apex?.length === 1 ? item.apex[0].no : null); return (item.apex || []).find(a => String(a.no) === String(pick))?.name || ''; };
  const firstWord = item => { const a = [apexName(item), item.nameShown, item.name].find(v => /[\u0621-\u064a]/.test(v || '')) || '';
    return String(a).replace(/[()\[\]\d\/]+/g, ' ').split(/\s+/).filter(w => w.length > 1 && !/^(?:ك|كيلو|ربع|نص|نصف|عرض|وجب[ةه]|طبق|طاجن|ساندو[يى]?تش|سندوتش|صيني[ةه]|ال)$/.test(w))[0] || ''; };
  const words = items.map(firstWord);
  for (const [n, item] of items.entries()) {
    // Karim 11-16: the receipt prints one line of the comment (~35 letters, Apex 703733): the dish's choices short —
    // «صدور: طحينة/بابا/مخلل» — after the customer's own words.
    const free = [...new Set((item.freeOptions || []).flatMap(v => String(v || '').split(/\s*[|\n]\s*/)).map(v => shortChoice(cleanChoice(stripPlatformNotes(v)))).filter(Boolean))];
    // Two dishes with the same first word: by their number instead.
    const short = words[n] && words.filter(w => w === words[n]).length === 1 ? words[n] : '';
    const label = short || (withChoices > 1 ? 'الصنف ' + (n + 1) : '');
    if (free.length) parts.push((label ? label + ': ' : '') + free.join('/'));
    // The customer's note under a dish says which dish when there are more than one (Karim 11-19 review).
    if (item.note) parts.push((items.length > 1 && (short || words[n]) ? (short || words[n]) + ': ' : '') + clean(item.note));
  }
  const once = new Set();
  return apexText(parts.filter(p => p && !once.has(nk(p)) && once.add(nk(p))).join(' | '));
}

// Karim 11-15 «التعليقات الي تخص الديلفري تبقي في العلامه المميزه والي يخص الطلب نفسو يبقي في كومنت الاوردر»: the comment's
// pieces about reaching the customer (call, door, gate, landmark, pilot) go to the order's special mark;
// money and change stay in the comment (Karim 11-15 «موضوع الفكه ده وباقي الفلوس سيبك منو»);
// the rest — the food — stays the order's comment.
const DELIVERY_NOTE = /(?:اتصل|اتصال|كلم|كلمني|رن|رنه|رنة|مكالم|موبايل|تليفون|الرقم|رقم\s*تاني|واتس|الباب|الجرس|جرس|انتركوم|الانتركوم|البواب|بواب|الامن|الأمن|سكيوريتي|security|البوابه|البوابة|بوابه|بوابة|gate|door|call|intercom|ring|العماره|العمارة|عماره|برج|الدور|الشقه|الشقة|اسانسير|الاسانسير|مصعد|سلم|ينزل|انزل|هنزل|نازل|استلم|استلام|يستلم|الريسبشن|reception|امام|أمام|قدام|جنب|بجوار|بجانب|ورا|خلف|بعد|قبل|ناصيه|ناصية|يمين|شمال|لوكيشن|location|العنوان|عنوان|الطيار|طيار|المندوب|مندوب|الدليفري|دليفري|delivery|يوصل|توصيل|الوصول|توصل|وصول)/iu;
export function splitDeliveryComment(text) {
  const parts = String(text || '').split(/\s*[|\n]\s*/).map(x => x.trim()).filter(Boolean);
  const delivery = [], order = [];
  for (const x of parts) {
    const food = /(?:الاكل|الأكل|سخن|مستوي|حساسي|فول سوداني|مكسرات|بصل|ثوم|طحين|عيش|صوص|ملح|حار|شطه|شطة|سلط)/u.test(x);
    (DELIVERY_NOTE.test(x) && !food ? delivery : order).push(x);
  }
  return { order: order.join(' | '), delivery: delivery.join(' | ') };
}

// Karim 11-15 (Apex 703733: «287 ب شارع ترعة الجبل الزيتون بالعمارة معمل بيوميديكا للتحاليل الطبية، عمارة 287 ب» on one
// line, «العنوان مش متقسم»): the address keeps the street and the building, like staff write it («14ش ابن الرومي»); what
// shows the way (in front of, next to, the shop in the building) goes to the special mark («صيدلية عائشة»); a building
// number said twice is said once.
const WAY_MARK = /(?:^|\s)(?:ب?ال?عمار[ةه]\s+(?=[\u0621-\u064a]{3})|(?:بجوار|بجانب|جنب|امام|أمام|قدام|خلف|وراء|فوق|علي\s*ناصي[ةه]|على\s*ناصي[ةه]|بالقرب\s*من|قريب\s*من|مقابل|في\s*وش|فى\s*وش|صيدلي[ةه]|معمل|مستشف[يى]|بنزين[ةه]|سوبر\s*ماركت)(?=\s|$))/u;
export function splitAddressLandmark(street) {
  const parts = String(street || '').split(/\s*[،,]\s*/).map(x => x.trim()).filter(Boolean);
  const keep = [], marks = [];
  for (const part of parts) {
    const m = WAY_MARK.exec(part);
    if (!m) { keep.push(part); continue; }
    const head = part.slice(0, m.index).trim(), tail = part.slice(m.index).trim();
    // Only when what is left is still an address («شارع جامع الفتح» is not cut to «شارع»).
    if (head && !(head.split(/\s+/).length >= 2 && /[\d٠-٩]|شارع|ش\s|ع\s|عمار|برج|فيلا|مجموع|بلوك|block/i.test(head))) { keep.push(part); continue; }
    if (head) keep.push(head.replace(/[\s\-–—]+$/u, ''));
    marks.push(tail.replace(/^ب?ال?عمار[ةه]\s+/, 'في العمارة '));
  }
  // «عمارة 287 ب» when «287 ب» is already in the address: once.
  const out = keep.filter((x, i) => { const n = /^(?:عمار[ةه]|ع|مبن[يى]|برج)\s*[:：]?\s*([\d٠-٩]+\s*[\u0621-\u064aA-Za-z]?)$/.exec(x); return !(n && keep.some((y, j) => j !== i && y.startsWith(n[1].trim() + ' '))); });
  if (!keep.length && !LANDMARK.test(String(street || '').trim())) return { street: String(street || '').trim(), landmark: '' };
  return { street: (out.length ? out : keep).join('، '), landmark: marks.join('/') };
}


// Treat untranslated place names as useful address text. Codes such as B12 do not need a translation.
export function addressNeedsArabic(value) {
  return (String(value || '').match(/[A-Za-z\d]+(?:['-][A-Za-z\d]+)*/g) || [])
    .some(word => /[A-Za-z]{2}/.test(word) && !/^[A-Z]{2,4}$|^[A-Za-z]{1,2}-?\d+[A-Za-z]?$|^\d+-?[A-Za-z]{1,2}$/.test(word));
}

export function formatDeliveryAddress(raw, { apexArea, sourceArea, signBase, pickup } = {}) {
  const base = apexText(signBase);
  if (pickup) return { main: '0', floor: '0', flat: '0', sign: deliveryMark(base, '', 100), issue: null };
  const realArea = areaBase(sourceArea), realKey = addressKey(realArea), apexKey = addressKey(areaBase(apexArea));
  const distinct = !!realKey && realKey !== apexKey;
  const parts = deliveryAddress(raw, [apexArea, distinct ? realArea : null]);
  const split = splitAddressLandmark(parts.street);
  const areaInStreet = (' ' + addressKey(split.street) + ' ').includes(' ' + realKey + ' ');
  // A different region belongs in the address, after the concrete delivery location.
  const street = [split.street, distinct && !areaInStreet ? realArea : null].filter(Boolean).join('، ');
  const marks = [...new Set([split.landmark, parts.mark].map(mark => String(mark || '').trim()).filter(Boolean))];
  let line = splitDeliveryAddress(street);
  let sign = deliveryMark(base, [line.extra, ...marks].filter(Boolean).join('/'), 100);
  // A long landmark can use spare street capacity, but no part may be discarded to make it fit.
  if (sign == null && marks.length) {
    const alternate = splitDeliveryAddress([street, ...marks].join('، '));
    const alternateSign = deliveryMark(base, alternate.extra, 100);
    if (alternateSign != null) { line = alternate; sign = alternateSign; }
  }
  const issue = parts.conflict ? 'فيه أكتر من رقم للدور أو الشقة — راجع عنوان العميل'
    : (!split.street && !marks.length) || (!line.main && line.extra)
    ? 'العنوان فيه المنطقة بس أو تفاصيله مش كاملة — راجع عنوان العميل'
    : sign == null || parts.floor.length > 20 || parts.flat.length > 20 ? 'العنوان أو العلامة المميزة أطول من خانات Apex — راجع العنوان قبل التسجيل'
    : null;
  const warning = addressNeedsArabic([street, ...marks, parts.floor, parts.flat].join(' ')) ? 'فيه أسماء في العنوان اتنقلت زي ما العميل كتبها' : null;
  return { main: line.main, floor: parts.floor, flat: parts.flat, sign, issue, warning };
}
