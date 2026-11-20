// What Karim confirmed (11-16) for the areas and dishes that kept orders waiting for a person: the platform's words →
// the Apex area or item, used by the transfer page and the automatic transfer before anything is learned.
// «لو مكتوب مدينه نصر ومصر الجديده او عنوان عام ناخد المنطقه من تفاصيل العنوان».
// «المستقبل اربطها بالشروق بس لازم يكون مكتوب المستقبل في العنوان الي هيتسجل».

export const norm = s => String(s || '').replace(/[‎‏‪-‮]/g, '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/ڤ/g, 'ف').replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim().toLowerCase();

// [source ('talabat' | 'site' | null for both), pattern on the normalized area, Apex area number, extra]
// The more specific first («الزيتون - كوبري القبة» is كوبري القبة, not الزيتون).
const AREAS = [
  // 11-20 (Talabat #5972: «الشروق - الحي السابع» went to مدينة نصر's «الحي السابع», 49): a city written first decides — these come before every district.
  ['talabat', /^مدينتي(?=\s|$)/, 370],
  ['talabat', /^الشروق(?=\s|$)/, 371],
  ['talabat', /^التجمع الاول(?=\s|$)/, 355],
  ['talabat', /^التجمع (الثالث|3)(?=\s|$)/, 356],
  ['talabat', /كوبري القبه/, 46], ['talabat', /حلميه الزيتون/, 14], ['talabat', /منشيه التحرير/, 52],
  ['talabat', /^الزيتون(?=\s|$)|الاميريه/, 151],
  ['talabat', /مكرم عبيد/, 19], ['talabat', /احمد فخري/, 145], ['talabat', /مصطفي النحاس/, 23], ['talabat', /الحي السابع|ذاكر حسين/, 49],
  ['talabat', /الحي العاشر/, 51], ['talabat', /استاد القاهره/, 360], ['talabat', /يوسف عباس/, 210], ['talabat', /جنينه مول/, 358], ['talabat', /الماسه/, 241],
  ['talabat', /الكوربه|البارون/, 159], ['talabat', /الخليفه المامون/, 136], ['talabat', /ميدان تريومف/, 141], ['talabat', /ميدان المحكمه/, 142],
  ['talabat', /روكسي/, 140], ['talabat', /مصر الجديده - الحريه/, 359], ['talabat', /السبع عمارات/, 12], ['talabat', /ميريلاند/, 42], ['talabat', /^الماظه$/, 7],
  ['talabat', /مساكن شيراتون|نادي الجلاء/, 33],
  ['talabat', /^(عباسيه \d+|العباسيه)$/, 26],
  ['talabat', /^(\d+ )?التجمع الخامس(?=\s|$)|قطاميه هايتس|بالم هيلز قطاميه|لافونتاين|فيلات القرنفل|فاونتن بارك|^النرجس الجديده$/, 354],
  ['site', /^التجمع الاول$/, 332], ['site', /^الرحاب/, 331], ['site', /التسعين/, 218], ['site', /^الشروق$/, 371], ['site', /^المطريه$/, 149],
  ['site', /حدائق القبه|مصر والسودان/, 148], ['site', /العباسيه/, 26], ['site', /شيراتون/, 33], ['site', /^الظاهر$/, 312], ['site', /^المقطم$/, 234],
  ['site', /عين شمس والزيتون/, 151], ['site', /^المستقبل$/, 371, { addAddress: 'المستقبل' }],
];
// An area that says only the district: the area comes from the address.
const GENERAL = /^(مدينه نصر|مصر الجديده|القاهره|cairo)$/;

// Rules Karim adds from the admin page (11-17, no publish needed): checked before the built-in ones, by the whole
// normalized words or as a part of them. { areas: [{ words, source, no, addAddress }], items: [{ name, no }] }.
let extra = { areas: [], items: [] };
export function setExtraRules(x) {
  const clean = (list, f) => (Array.isArray(list) ? list : []).map(f).filter(Boolean);
  extra = {
    areas: clean(x?.areas, r => { const w = norm(r?.words), no = Number(r?.no); return w && Number.isInteger(no) && no > 0 ? { words: w, source: r.source === 'talabat' || r.source === 'site' ? r.source : null, no, addAddress: String(r.addAddress || '').trim().slice(0, 60) || null } : null; }),
    items: clean(x?.items, r => { const n = norm(r?.name), no = String(r?.no || '').trim(); return n && /^[0-9A-Za-z]{1,20}$/.test(no) ? { name: n, no } : null; }),
  };
  return extra;
}
const has = (t, w) => t === w || (' ' + t + ' ').includes(' ' + w + ' ');

export function areaRule(words, source) {
  const t = norm(words); if (!t) return null;
  for (const r of extra.areas) if ((!r.source || r.source === source) && has(t, r.words)) return { no: r.no, ...(r.addAddress ? { addAddress: r.addAddress } : {}) };
  if (GENERAL.test(t)) return { general: true };
  for (const [src, re, no, extra] of AREAS) if ((!src || src === source) && re.test(t)) return { no, ...(extra || {}) };
  return null;
}

// Dishes: the order's name (Talabat's or the website's) → the Apex item; a sandwich by its bread («ملفوف» or not).
const wrapped = item => { const t = norm([item.sizeOption, ...(item.freeOptions || []), ...(item.modifiers || [])].filter(Boolean).join(' ')); return /ملفوف|رول|roll|wrap/.test(t) && !/بلدي|baladi/.test(t); };
const ITEMS = [
  [/^بطاطس محمره$/, '0103005'], [/^محشي مشكل$/, '0103004'], [/^ثوميه$/, '0101006'],
  [/^بيبسي( علب)?$/, '0202001'], [/^سفن ?اب( علب)?$/, '0202002'], [/^ميرندا( برتقال)?( علب)?$/, '0202003'],
  [/^ارز بسمتي (مع |ب)ال?كبده$/, '0103013'], [/^ارز بالخلطه$/, '0103011'], [/^سلطه (شرقي|خضرا|خضراء)$/, '0101002'],
  [/^kofta roll sandwich$/, '0104002'], [/^kebab sandwich$/, i => wrapped(i) ? '0104011' : '0104010'],
  [/^ساندوتش كبده اسكندراني/, i => wrapped(i) ? '0104020' : '0104019'],
  [/^طبق كباب وكفته ضاني$/, '0109011'],
];
// Talabat sells the meal, the quarter-kilo offer, and the molokhia offer as distinct products.
const TALABAT_ITEMS = [
  [/^(?:عرض وجبه كفته(?: طلبات)?|kofta meal offer)$/, '0116001'],
  [/^(?:عرض ربع(?: كيلو)? كفته(?: طلبات)?|1\/4 grilled kofta offer)$/, '218'],
  [/^(?:عرض (?:وجبه|(?:تلت|ثلث)(?: كيلو)?) كفته و\s*ملوخيه(?: طلبات)?|kofta and molokhia meal offer)$/, '315'],
];

export function itemRule(item, source) {
  const t = norm(item?.name); if (!t) return null;
  for (const r of extra.items) if (t === r.name) return r.no;
  if (source === 'talabat') for (const [re, no] of TALABAT_ITEMS) if (re.test(t)) return no;
  for (const [re, no] of ITEMS) if (re.test(t)) return typeof no === 'function' ? no(item) : no;
  return null;
}
