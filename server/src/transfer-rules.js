// What Karim confirmed (11-16) for the areas and dishes that kept orders waiting for a person: the platform's words →
// the Apex area or item, used by the transfer page and the automatic transfer before anything is learned.
// «لو مكتوب مدينه نصر ومصر الجديده او عنوان عام ناخد المنطقه من تفاصيل العنوان».
// «المستقبل اربطها بالشروق بس لازم يكون مكتوب المستقبل في العنوان الي هيتسجل».

export const norm = s => String(s || '').replace(/[‎‏‪-‮]/g, '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/ڤ/g, 'ف').replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim().toLowerCase();

// [source ('talabat' | 'site' | null for both), pattern on the normalized area, Apex area number, extra]
// The more specific first («الزيتون - كوبري القبة» is كوبري القبة, not الزيتون).
const AREAS = [
  ['talabat', /كوبري القبه/, 46], ['talabat', /حلميه الزيتون/, 14], ['talabat', /منشيه التحرير/, 52],
  ['talabat', /^الزيتون(?=\s|$)|الاميريه/, 151],
  ['talabat', /مكرم عبيد/, 19], ['talabat', /احمد فخري/, 145], ['talabat', /مصطفي النحاس/, 23], ['talabat', /الحي السابع|ذاكر حسين/, 49],
  ['talabat', /الحي العاشر/, 51], ['talabat', /استاد القاهره/, 360], ['talabat', /يوسف عباس/, 210], ['talabat', /جنينه مول/, 358], ['talabat', /الماسه/, 241],
  ['talabat', /الكوربه|البارون/, 159], ['talabat', /الخليفه المامون/, 136], ['talabat', /ميدان تريومف/, 141], ['talabat', /ميدان المحكمه/, 142],
  ['talabat', /روكسي/, 140], ['talabat', /مصر الجديده - الحريه/, 359], ['talabat', /السبع عمارات/, 12], ['talabat', /ميريلاند/, 42], ['talabat', /^الماظه$/, 7],
  ['talabat', /مساكن شيراتون|نادي الجلاء/, 33],
  ['talabat', /^(عباسيه \d+|العباسيه)$/, 26],
  ['talabat', /^مدينتي(?=\s|$)/, 370],
  ['talabat', /^الشروق(?=\s|$)/, 371],
  ['talabat', /^التجمع الاول(?=\s|$)/, 355],
  ['talabat', /^التجمع (الثالث|3)(?=\s|$)/, 356],
  ['talabat', /^(\d+ )?التجمع الخامس(?=\s|$)|قطاميه هايتس|بالم هيلز قطاميه|لافونتاين|فيلات القرنفل|فاونتن بارك|^النرجس الجديده$/, 354],
  ['site', /^التجمع الاول$/, 332], ['site', /^الرحاب/, 331], ['site', /التسعين/, 218], ['site', /^الشروق$/, 371], ['site', /^المطريه$/, 149],
  ['site', /حدائق القبه|مصر والسودان/, 148], ['site', /العباسيه/, 26], ['site', /شيراتون/, 33], ['site', /^الظاهر$/, 312], ['site', /^المقطم$/, 234],
  ['site', /عين شمس والزيتون/, 151], ['site', /^المستقبل$/, 371, { addAddress: 'المستقبل' }],
];
// An area that says only the district: the area comes from the address.
const GENERAL = /^(مدينه نصر|مصر الجديده|القاهره|cairo)$/;

export function areaRule(words, source) {
  const t = norm(words); if (!t) return null;
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
  [/^طبق كباب وكفته ضاني$/, '0109011'],   // «المفروض بالوجبه»: the meal, whatever the weight
];
export function itemRule(item) {
  const t = norm(item?.name); if (!t) return null;
  for (const [re, no] of ITEMS) if (re.test(t)) return typeof no === 'function' ? no(item) : no;
  return null;
}
