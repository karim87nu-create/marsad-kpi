import { NAMES, translit, bySkeleton } from './arabic-names.js';
import { PLACE_PHRASES, NOTE_PHRASES } from './arabic-names-extra.js';
// English → Arabic for what customers type in English (Karim 01-11): addresses, names, comments — the way an Egyptian
// call-center employee would write them on Apex, not word for word. With an OpenAI key (config.openaiKey) the text is
// translated by the model; without it (or until the model answers) a dictionary turns the common address words into
// Arabic and leaves the rest as it is. Every answer is kept, so a text is translated once.
const LATIN = /[A-Za-z]{2,}/;

// Common address words (whole words, case-insensitive). Longer phrases first.
const ADDRESS = [
  ['in front of', 'أمام'], ['infront of', 'أمام'], ['in-front of', 'أمام'], ['opposite to', 'أمام'], ['opposite', 'أمام'], ['next to', 'بجوار'], ['beside', 'بجوار'],
  ['behind', 'خلف'], ['near', 'بالقرب من'], ['close to', 'بالقرب من'], ['above', 'فوق'], ['beneath', 'تحت'], ['corner of', 'ناصية'], ['corner', 'ناصية'],
  ['ground floor', 'الدور الأرضي'], ['first floor', 'الدور الأول'], ['second floor', 'الدور الثاني'], ['third floor', 'الدور الثالث'],
  // Karim 11-14 (Talabat addresses as Apex showed them): Franco / transliterated address words.
  ['bedon esm', 'بدون اسم'], ['bdon esm', 'بدون اسم'], ['without name', 'بدون اسم'], ['tariaq', 'طريق'], ['tariq', 'طريق'], ['tarik', 'طريق'], ['tare2', 'طريق'],
  ['magmou3a', 'مجموعة'], ['magmo3a', 'مجموعة'], ['magmoua', 'مجموعة'], ['mgmo3a', 'مجموعة'], ['3emara', 'عمارة'], ['emara', 'عمارة'], ['3omara', 'عمارة'],
['helmiya', 'حلمية'], ['helmeya', 'حلمية'], ['dobaet', 'ضباط'], ['dobbat', 'ضباط'], ['atteya', 'عطية'], ['attia', 'عطية'], ['batal', 'بطل'],
    ['7ay', 'حي'], ['7ai', 'حي'], ['hay', 'حي'], ['zhraa', 'الزهراء'], ['msaken', 'مساكن'], ['masaken', 'مساكن'],
  ['street', 'شارع'], ['st.', 'شارع'], ['st', 'شارع'], ['road', 'طريق'], ['rd', 'طريق'], ['avenue', 'شارع'], ['ave', 'شارع'], ['axis', 'محور'], ['square', 'ميدان'],
  ['building', 'عمارة'], ['bldg.', 'عمارة'], ['bldg', 'عمارة'], ['bld', 'عمارة'], ['tower', 'برج'], ['villa', 'فيلا'], ['house', 'بيت'], ['compound', 'كمبوند'], ['gate', 'بوابة'],
  ['entrance', 'مدخل'], ['block', 'بلوك'], ['zone', 'منطقة'], ['district', 'حي'], ['neighborhood', 'حي'], ['neighbourhood', 'حي'], ['area', 'منطقة'], ['sector', 'قطاع'],
  ['floor', 'الدور'], ['apartment', 'شقة'], ['apt.', 'شقة'], ['apt', 'شقة'], ['flat', 'شقة'], ['unit', 'وحدة'], ['ground', 'أرضي'], ['roof', 'روف'], ['duplex', 'دوبلكس'],
  ['mall', 'مول'], ['cafe', 'كافيه'], ['restaurant', 'مطعم'], ['school', 'مدرسة'], ['university', 'جامعة'], ['mosque', 'مسجد'], ['church', 'كنيسة'],
  ['pharmacy', 'صيدلية'], ['hospital', 'مستشفى'], ['clinic', 'عيادة'], ['bank', 'بنك'], ['club', 'نادي'], ['hotel', 'فندق'], ['park', 'بارك'], ['market', 'ماركت'],
  ['supermarket', 'سوبر ماركت'], ['gas station', 'بنزينة'], ['station', 'محطة'], ['bridge', 'كوبري'], ['office', 'مكتب'], ['company', 'شركة'], ['bakery', 'مخبز'],
  ['north', 'الشمالية'], ['south', 'الجنوبية'], ['east', 'الشرقية'], ['west', 'الغربية'], ['new', 'الجديدة'], ['old', 'القديمة'],
  ['first', 'الأول'], ['second', 'الثاني'], ['third', 'الثالث'], ['fourth', 'الرابع'], ['fifth', 'الخامس'], ['sixth', 'السادس'], ['settlement', 'التجمع'],
  ['mostakbal city', 'مدينة المستقبل'], ['mostaqbal city', 'مدينة المستقبل'], ['mostakbal', 'المستقبل'], ['mostaqbal', 'المستقبل'],
  ['el banafseg', 'البنفسج'], ['banafseg', 'البنفسج'], ['al yasmeen', 'الياسمين'], ['el yasmeen', 'الياسمين'],
  ['fifth settlement', 'التجمع الخامس'], ['first settlement', 'التجمع الأول'], ['el shorouk', 'الشروق'],
  ['cairo', 'القاهرة'], ['giza', 'الجيزة'], ['egypt', 'مصر'], ['nasr city', 'مدينة نصر'], ['heliopolis', 'مصر الجديدة'], ['new cairo', 'القاهرة الجديدة'],
  ['madinaty', 'مدينتي'], ['rehab', 'الرحاب'], ['tagamoa', 'التجمع'], ['katameya', 'القطامية'], ['kattameya', 'القطامية'], ['maadi', 'المعادي'], ['zamalek', 'الزمالك'],
  ['mokattam', 'المقطم'], ['shorouk', 'الشروق'], ['obour', 'العبور'], ['katameya dunes', 'قطامية ديونز'], ['katameya heights', 'قطامية هايتس'], ['dunes', 'ديونز'], ['cluster', 'كلاستر'], ['hyde park', 'هايد بارك'], ['mivida', 'ميفيدا'], ['mountain view', 'ماونتن فيو'],
  ['makram ebeid', 'مكرم عبيد'], ['abbas el akkad', 'عباس العقاد'], ['abbas al akkad', 'عباس العقاد'], ['el nasr', 'النصر'], ['al nasr', 'النصر'], ['nasr', 'نصر'],
  ['gardenia city', 'جاردينيا سيتي'], ['gardenia', 'جاردينيا سيتي'], ['taj sultan', 'تاج سلطان'], ['tag sultan', 'تاج سلطان'],
  ['main street', 'الشارع الرئيسي'], ['primary street', 'الشارع الرئيسي'], ['main road', 'الطريق الرئيسي'],
  ['the waterway', 'ذا ووتر واي'], ['waterway', 'ووتر واي'], ['north 90th street', 'شارع التسعين الشمالي'], ['south 90th street', 'شارع التسعين الجنوبي'],
  ['number', 'رقم'], ['landmark', 'علامة مميزة'], ['building no.', 'عمارة'],
  ['door code', 'كود الباب'], ['group', 'مجموعة'], ['phase', 'مرحلة'],
  ['abd el aziz', 'عبدالعزيز'], ['salah el din', 'صلاح الدين'], ['saif el deen', 'سيف الدين'],
  ...PLACE_PHRASES,
];
const INSTRUCTIONS = [
  ...NOTE_PHRASES,
  ['do not ring the doorbell', 'ماتضربش الجرس'], ["don't ring the doorbell", 'ماتضربش الجرس'], ['dont ring the bell', 'متضربش الجرس'],
  ['ring the doorbell', 'اضرب الجرس'], ['call instead of ringing', 'اتصل بدل ما تضرب الجرس'],
  ['text me when you arrive', 'ابعتلي رسالة لما توصل'], ['leave it at the door', 'سيبه على الباب'], ['leave it at reception', 'سيبه في الاستقبال'],
  ['leave at reception', 'سيبه في الاستقبال'], ['leave with security', 'سيبه مع الأمن'], ['knock on the door', 'خبط على الباب'],
  ['blash trn el gars', 'بلاش ترن الجرس'], ['kalemni lama twsal', 'كلمني لما توصل'], ['kalemny lama tewsal', 'كلمني لما توصل'],
  ['bedon basal', 'من غير بصل'], ['men 8er basal', 'من غير بصل'], ['mesh 7ar', 'مش حار'], ['kol haga fe kees', 'كل حاجة في كيس'],
  ["i'm allergic to", 'عندي حساسية من'], ['i am allergic to', 'عندي حساسية من'], ['allergy to', 'حساسية من'],
  ['before arriving', 'قبل ما توصل'], ['once you arrive', 'لما توصل'], ['when you get here', 'لما توصل'],
  ['do not add any', 'ماتحطش'], ["don't add any", 'ماتحطش'], ['dont add any', 'ماتحطش'],
  ['do not add', 'ماتحطش'], ["don't add", 'ماتحطش'], ['dont add', 'ماتحطش'], ['do not include', 'ماتحطش'], ["don't include", 'ماتحطش'],
  ['just', 'بس'], ['ring once', 'رن مرة واحدة'], ['call twice', 'اتصل مرتين'], ['without ringing', 'ماتضربش الجرس'],
  ['leave it at the gate', 'سيبه عند البوابة'], ['make it well done', 'خليه مستوي كويس'],
  ['do not call me', 'ماتتصلش بيا'], ["don't call me", 'ماتتصلش بيا'], ['call my other number', 'اتصل بالرقم التاني'],
  ['no utensils', 'من غير أدوات أكل'], ['no disposable cutlery', 'من غير أدوات أكل'], ['do not put', 'ماتحطش'], ["don't put", 'ماتحطش'],
  ['with no', 'من غير'], ['onions on the side', 'البصل على جنب'], ['sauces on the side', 'الصوصات على جنب'],
  ['separate the sauces', 'حط الصوصات لوحدها'], ['pack separately', 'غلّف كل حاجة لوحدها'], ['allergic to', 'عندي حساسية من'],
  ['peanut allergy', 'حساسية فول سوداني'], ['peanuts', 'فول سوداني'], ['nuts', 'مكسرات'], ['sesame', 'سمسم'], ['dairy', 'منتجات ألبان'],
  ['not too spicy', 'حار خفيف'], ['do not make it spicy', 'خليه من غير شطة'], ["don't make it spicy", 'خليه من غير شطة'],
  ['without any', 'من غير'], ['no ice', 'من غير تلج'], ['no sugar', 'من غير سكر'], ['no chili', 'من غير شطة'], ['less oil', 'زيت خفيف'],
  ['and', 'و'], ['if possible', 'لو أمكن'], ['if unavailable', 'لو مش متاح'], ['unless', 'إلا لو'], ['because', 'عشان'],
  // Complete phrases precede individual words so negatives keep their meaning.
  ["don't ring the bell", 'متضربش الجرس'], ['do not ring the bell', 'متضربش الجرس'], ['no onions', 'من غير بصل'],
  ['when you arrive', 'لما توصل'], ['on arrival', 'عند الوصول'], ['well done', 'تسوية كاملة'], ['not spicy', 'غير حار'],
  ['no spices', 'بدون توابل'], ['no salt', 'بدون ملح'], ['no sauce', 'بدون صوص'], ['sauce on the side', 'الصوص على جنب'],
  ['extra bread', 'عيش زيادة'], ['extra rice', 'أرز زيادة'], ['white rice', 'أرز أبيض'], ['basmati rice', 'أرز بسمتي'],
  ['rice with vermicelli', 'أرز بالشعرية'], ['with liver', 'بالكبدة'], ['with nuts', 'بالمكسرات'],
  ['bread', 'عيش'], ['onions', 'بصل'], ['onion', 'بصل'], ['pickles', 'مخلل'], ['sauce', 'صوص'], ['salt', 'ملح'],
];
const PERSON_PHRASES = [
  ['abd el fattah', 'عبدالفتاح'], ['abd al fattah', 'عبدالفتاح'], ['abd el hamid', 'عبدالحميد'], ['abdel hameed', 'عبدالحميد'],
  ['abd el ghany', 'عبدالغني'], ['abd el monem', 'عبدالمنعم'], ['mohamed ali', 'محمد علي'],
  ['abd el rahman', 'عبدالرحمن'], ['abdel rahman', 'عبدالرحمن'], ['abd el rahim', 'عبدالرحيم'], ['abd el aziz', 'عبدالعزيز'],
  ['mohamed', 'محمد'], ['mohammed', 'محمد'], ['mohammad', 'محمد'], ['ahmed', 'أحمد'], ['mahmoud', 'محمود'],
  ['karim', 'كريم'], ['kareem', 'كريم'], ['ismail', 'إسماعيل'], ['baraka', 'بركة'], ['mona', 'منى'], ['hend', 'هند'],
  ['omar ibn el khattab', 'عمر بن الخطاب'], ['omar ibn al khattab', 'عمر بن الخطاب'], ['ibn el khattab', 'بن الخطاب'], ['el khattab', 'الخطاب'], ['ibn', 'بن'],
  ['atia', 'عطية'], ['ali', 'علي'], ['hassan', 'حسن'], ['hussein', 'حسين'], ['omar', 'عمر'], ['youssef', 'يوسف'],
];
const NOTE_WORDS = [
  ['please', 'من فضلك'], ['call me', 'كلمني'], ['call', 'اتصل'], ['ring the bell', 'اضرب الجرس'], ["don't ring", 'متضربش الجرس'], ['no onion', 'من غير بصل'],
  ['without', 'من غير'], ['extra', 'زيادة'], ['spicy', 'حار'], ['no', 'من غير'], ['thanks', 'شكراً'], ['thank you', 'شكراً'],
];
// Comments and the dish's choices (11-16 Talabat #1574: «Replace Tahini with Yogurt Salads» was printed spelled out
// letter by letter in Arabic): food words, and a word not known stays in English rather than spelled out.
const FOOD = [
  // Karim 11-19 review (Apex comments «I need pickled tomato instead…», «i want baladi bread with it»): the customer's usual phrases.
  ['i need', 'عايز'], ['i want', 'عايز'], ['i would like', 'عايز'], ["i'd like", 'عايز'], ['can you', 'ياريت'], ['could you', 'ياريت'], ['can i have', 'عايز'],
  ['pickled tomatoes', 'طماطم مخللة'], ['pickled tomato', 'طماطم مخللة'], ['pickled cucumber', 'خيار مخلل'], ['pickles', 'مخلل'], ['pickled', 'مخلل'],
  ['baladi bread', 'عيش بلدي'], ['syrian bread', 'عيش سوري'], ['bread', 'عيش'], ['with it', 'معاه'], ['with them', 'معاهم'], ['for me', 'ليا'],
  ['my order', 'الأوردر'], ['my orders', 'أوردراتي'], ['discount', 'خصم'], ['extra bag', 'كيس زيادة'], ['bag', 'كيس'], ['i have a', 'عندي'], ['i have', 'عندي'], ['discount on', 'خصم على'],
  ['instead of', 'بدل'], ['replace', 'بدل'], ['change', 'تغيير'], ['with', 'مع'], ['add', 'إضافة'], ['remove', 'من غير'], ['only', 'بس'],
  ['on the side', 'على جنب'], ['side', 'جنب'], ['less', 'قليل'], ['more', 'زيادة'], ['cold', 'ساقع'], ['hot', 'سخن'],
  ['yogurt salads', 'سلطة زبادي'], ['yogurt salad', 'سلطة زبادي'], ['tahini salad', 'سلطة طحينة'], ['green salad', 'سلطة خضراء'], ['oriental salad', 'سلطة بلدي'],
  ['baba ghanoush', 'بابا غنوج'], ['garlic sauce', 'ثومية'], ['salads', 'سلطات'], ['salad', 'سلطة'], ['tahini', 'طحينة'], ['tahina', 'طحينة'],
  ['yogurt', 'زبادي'], ['yoghurt', 'زبادي'], ['garlic', 'ثوم'], ['coleslaw', 'كول سلو'], ['french fries', 'بطاطس'], ['fries', 'بطاطس'],
  ['chicken', 'فراخ'], ['grilled', 'مشوي'], ['rice', 'أرز'], ['pasta', 'مكرونة'], ['molokhia', 'ملوخية'], ['soup', 'شوربة'], ['lentil', 'عدس'],
  ['kofta', 'كفتة'], ['kebab', 'كباب'], ['liver', 'كبدة'], ['sausage', 'سجق'], ['baladi', 'بلدي'], ['wrapped', 'ملفوف'], ['wrap', 'ملفوف'], ['roll', 'رول'],
  ['ketchup', 'كاتشب'], ['mayonnaise', 'مايونيز'], ['mayo', 'مايونيز'], ['tomatoes', 'طماطم'], ['tomato', 'طماطم'], ['cucumber', 'خيار'], ['lemon', 'ليمون'],
  ['pepsi', 'بيبسي'], ['water', 'مياه'], ['cutlery', 'أدوات أكل'], ['napkins', 'مناديل'], ['tissues', 'مناديل'], ['spoon', 'معلقة'], ['fork', 'شوكة'],
].sort((a, b) => b[0].length - a[0].length);
const wordKey = value => value.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
function phrasebook(entries) {
  const words = new Map();
  for (const [en, ar] of entries) if (!words.has(en)) words.set(en, ar);
  const options = [...words.keys()].sort((a, b) => b.length - a.length)
    .map(word => word.replace(/[^a-z0-9 '’-]/gi, c => '\\' + c).replace(/'/g, "['’‘]").replace(/ /g, '\\s+'));
  const pattern = new RegExp('(?<![A-Za-z0-9])(?:' + options.join('|') + ')(?![A-Za-z0-9])', 'gi');
  return text => text.replace(pattern, word => words.get(wordKey(word)) ?? word);
}
const addressWords = phrasebook([...ADDRESS, ...PERSON_PHRASES]);
const personWords = phrasebook(PERSON_PHRASES);
const noteWords = phrasebook([...INSTRUCTIONS, ...FOOD, ...NOTE_WORDS]);
const generalWords = phrasebook([...ADDRESS, ...PERSON_PHRASES, ...INSTRUCTIONS, ...FOOD, ...NOTE_WORDS]);

// Words still in English after the dictionary: what staff taught (learned), a known name, else spelled out in Arabic
// (Karim 11-11 «اي الصعب في تعريب الاسم والعنوان تلقائي»). Acronyms (AUC, CFC) and codes with digits (B12) stay.
function arabizeRest(s, learned, preserveUnknown = false) {
  return s.replace(/[A-Za-z][A-Za-z0-9']*/g, (w, at, all) => {
    const k = w.toLowerCase().replace(/'/g, '');
    if (preserveUnknown && (k === 'el' || k === 'al')) return w;
    let v = learned?.get(k) || NAMES[k] || (preserveUnknown ? null : bySkeleton(k));
    if (!v) { const franco = /[a-z]{2,}/i.test(w) && /[a-z][2356789]|[2356789][a-z]/i.test(w) && !/^[A-Za-z]{1,2}\d+$/.test(w);
      if (preserveUnknown || (/\d/.test(w) && !franco) || (/^[A-Z]{2,4}$/.test(w)) || w.length < 2) return w; v = translit(w); }
    return all.slice(Math.max(0, at - 2), at) === 'ال' && v.startsWith('ال') ? v.slice(2) : v;
  });
}

function dictionary(text, learned, kind = 'general') {
  const source = String(text || '');
  if (!/[A-Za-z]/.test(source)) return source;
  if (kind === 'note') {
    // Translate separately so a substitution cannot consume a second kitchen or delivery instruction.
    return source.split(/([|;؛،,\n]+)(?!\d)/).map((part, i) => {
      if (i % 2) return part.replace(/[;؛]+/g, ' | ').replace(/,/g, '،');
      const swap = /^\s*(?:(?:please|kindly)\s+)?(?:(do not|don['’]t|dont|never)\s+)?(?:replace|swap|change)\s+(.+?)\s+(?:with|for|to)\s+(.+?)\s*$/i.exec(part);
      if (swap) {
        const ingredient = value => noteWords(value.replace(/^the\s+/i, ''));
        return swap[1] ? 'ماتبدّلش ' + ingredient(swap[2]) + ' بـ ' + ingredient(swap[3])
          : 'بدل ' + ingredient(swap[2]) + ' حط ' + ingredient(swap[3]);
      }
      return noteWords(part);
    }).join('').replace(/[^\S\r\n]{2,}/g, ' ');
  }
  let s = source;
  if (kind !== 'name') s = s.replace(/\b(\d+)(?:st|nd|rd|th)\s+floor\b/gi, 'الدور $1').replace(/\bno\.?\s*(?=\d)/gi, 'رقم ');
  // Protect code segments from single-word replacements: West-12, ST-5, B12.
  const translate = kind === 'address' ? addressWords : kind === 'name' ? personWords : generalWords;
  s = s.split(/(\b[A-Za-z]{1,5}-\d+[A-Za-z]?\b)/).map((part, i) => {
    if (i % 2) return part;
    let value = translate(part);
    if (kind === 'address') {
      value = value.replace(/\b(?:El|Al)[-\s]+([A-Za-z][A-Za-z']*)(?![A-Za-z0-9])/gi, (whole, word) => {
        const arabic = NAMES[word.toLowerCase()];
        return arabic ? (arabic.startsWith('ال') ? arabic : 'ال' + arabic) : whole;
      });
      return arabizeRest(value, learned, true);
    }
    return arabizeRest(value.replace(/\b(?:El|Al)[-\s]+(?=[A-Za-z\u0600-\u06FF])/gi, 'ال'), learned);
  }).join('').replace(/الال/g, 'ال');
  if (kind !== 'name') {
    s = s.split(/\s*[،,]\s*(?!\d{3}(?:\D|$))/).map(seg => {
      const m = /^(.+?)\s+(شارع|ش|طريق|محور)$/.exec(seg);
      if (!m) return seg;
      const title = m[2] === 'ش' ? 'شارع' : m[2];
      if (/^(?:شارع|طريق|محور)\s/.test(m[1])) return m[1];
      const building = /^([0-9٠-٩۰-۹]+[A-Za-z]?)\s+(.+)$/.exec(m[1]);
      return building ? building[1] + '، ' + title + ' ' + building[2] : title + ' ' + m[1];
    }).join('، ');
  }
  return s.replace(/[^\S\r\n]{2,}/g, ' ').trim();
}

const PROMPT = 'أنت موظف كول سنتر في مطعم في القاهرة بيكتب الأوردر على السيستم. حوّل النص ده للعربي المصري زي ما الموظف بيكتبه للطيار: ' +
  'العناوين بأسماء الأماكن المعروفة بالعربي (مثلاً Katameya Dunes = قطامية ديونز، Street 70 = شارع 70، infront of = أمام)، والأسماء الشخصية تتكتب بالعربي (Ismail Baraka = إسماعيل بركة)، ' +
  'والملاحظات بمعناها مش حرفي. سيب الأرقام والعربي اللي موجود زي ما هو، ومتزودش ولا تشيل معلومة. رجّع النص المترجم بس من غير أي شرح.';

export function setup(app) {
  const { db } = app;
  const key = () => app.config.openaiKey || null;
  const memo = new Map();   // this instance's answers (the table keeps them for every instance)
  // Delivery addresses must not be guessed from spelling or old automatic translations.
  // Known place words remain Arabic; unknown place names and building codes stay intact.
  app.toArabicAddress = texts => new Map(texts.filter(Boolean).map(t => [t,dictionary(t, null, 'address')]));
  // Comments and choices: food words in Arabic, nothing spelled out (11-16).
  app.toArabicNote = texts => new Map(texts.filter(t => t && LATIN.test(t)).map(t => [t, dictionary(t, null, 'note')]));

  async function cached(texts) {
    const out = new Map(), want = [...new Set(texts.filter(t => t && LATIN.test(t)))];
    const miss = want.filter(t => { if (memo.has(t)) { out.set(t, memo.get(t)); return false; } return true; });
    for (let i = 0; i < miss.length; i += 50) {
      const part = miss.slice(i, i + 50);
      const rows = await db.prepare('SELECT src, ar, how FROM translations WHERE src IN (' + part.map(() => '?').join(',') + ')').all(...part);
      for (const r of rows) { const v = { ar: r.ar, how: r.how }; out.set(r.src, v); if (r.how === 'ai') memo.set(r.src, v); }
    }
    return out;
  }
  async function save(src, ar, how) {
    await db.prepare('INSERT INTO translations (src, ar, how, at) VALUES (?,?,?,?) ON CONFLICT(src) DO UPDATE SET ar = excluded.ar, how = excluded.how, at = excluded.at WHERE excluded.how = \'staff\' OR (translations.how <> \'staff\' AND (translations.how <> \'ai\' OR excluded.how = \'ai\'))')
      .run(src, ar, how, app.now());
    if (how === 'ai') memo.set(src, { ar, how });
  }
  async function ai(text) {
    const k = key(); if (!k) return null;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 12000);
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + k },
        body: JSON.stringify({ model: app.config.openaiModel || 'gpt-4o-mini', temperature: 0, max_tokens: 400,
          messages: [{ role: 'system', content: PROMPT }, { role: 'user', content: String(text).slice(0, 1000) }] }) });
      if (!r.ok) return null;
      const j = await r.json(), v = String(j?.choices?.[0]?.message?.content || '').trim();
      return v && v.length < 1500 ? v : null;
    } catch { return null; } finally { clearTimeout(t); }
  }
  const busy = new Set();
  // Arabic for each text now (cached, else the dictionary); the model's answer is fetched in the background for next time.
  // Words staff corrected (kept as «w:<word>» → Arabic, how = 'staff').
  async function learnedWords(texts) {
    const words = [...new Set(texts.flatMap(t => String(t || '').match(/[A-Za-z][A-Za-z0-9']*/g) || []).map(w => 'w:' + w.toLowerCase().replace(/'/g, '')))];
    const out = new Map();
    for (let i = 0; i < words.length; i += 80) {
      const part = words.slice(i, i + 80);
      try { for (const r of await db.prepare("SELECT src, ar FROM translations WHERE how = 'staff' AND src IN (" + part.map(() => '?').join(',') + ')').all(...part)) out.set(r.src.slice(2), r.ar); } catch {}
    }
    return out;
  }
  // What staff wrote instead of the automatic Arabic: the whole text, and word by word when the words line up.
  app.learnArabic = async function learnArabic(src, ar) {
    src = String(src || '').trim(); ar = String(ar || '').trim();
    if (!src || !ar || !LATIN.test(src) || LATIN.test(ar) || src.length > 300) return;
    await save(src, ar, 'staff');
    await save('name:v2:' + src, ar, 'staff');
    const en = src.split(/\s+/).filter(Boolean), arw = ar.split(/\s+/).filter(Boolean);
    if (en.length === arw.length && en.length <= 8) for (let i = 0; i < en.length; i++) if (/^[A-Za-z][A-Za-z']+$/.test(en[i])) await save('w:' + en[i].toLowerCase().replace(/'/g, ''), arw[i], 'staff');
  };
  app.toArabic = async function toArabic(texts, { waitUntil, wait = false, kind = 'general' } = {}) {
    const keyOf = t => kind === 'name' ? 'name:v2:' + t : t;
    const have = await cached(kind === 'name' ? [...texts.map(keyOf), ...texts] : texts), res = new Map(), learned = await learnedWords(texts);
    const todo = [];
    for (const t of new Set(texts.filter(Boolean))) {
      if (!LATIN.test(t)) { res.set(t, t); continue; }
      const previous = have.get(t);
      const c = have.get(keyOf(t)) || (previous?.how === 'staff' ? previous : null);
      if (c?.how === 'ai' || c?.how === 'staff') res.set(t, c.ar); else res.set(t, dictionary(t, learned, kind));
      if ((!c || !['ai', 'staff'].includes(c.how)) && key() && !busy.has(keyOf(t)) && (kind !== 'name' || LATIN.test(res.get(t)))) todo.push(t);
    }
    await Promise.all([...res].filter(([t]) => LATIN.test(t) && !have.get(keyOf(t))).map(([t, v]) => save(keyOf(t), v, 'dict').catch(() => {})));
    const run = async t => { busy.add(keyOf(t)); try { const v = await ai(t); if (v) { await save(keyOf(t), v, 'ai'); res.set(t, v); } } finally { busy.delete(keyOf(t)); } };
    if (todo.length) {
      if (wait) await Promise.all(todo.slice(0, 8).map(run));
      else if (waitUntil) waitUntil(Promise.all(todo.slice(0, 6).map(run)));
    }
    return res;
  };
  app.arabicDictionary = dictionary;
}
