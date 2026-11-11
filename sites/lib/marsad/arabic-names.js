// English spellings of Egyptian names and common address words → Arabic, the way the call center writes them
// (Karim 11-11: names and addresses typed in English are written in Arabic on Apex automatically, free — no paid AI).
// Keys are lower case; a word not here is spelled out by `translit` below, and what staff correct is learned
// (translate.js keeps it per word).
export const NAMES = {
  // men
  mohamed: 'محمد', mohammed: 'محمد', mohammad: 'محمد', muhammad: 'محمد', mohamad: 'محمد', mhmd: 'محمد', mo: 'مو', ahmed: 'أحمد', ahmad: 'أحمد', ahmd: 'أحمد',
  mahmoud: 'محمود', mahmud: 'محمود', mostafa: 'مصطفى', moustafa: 'مصطفى', mustafa: 'مصطفى', mostfa: 'مصطفى', ali: 'علي', aly: 'علي', omar: 'عمر', omer: 'عمر',
  amr: 'عمرو', amro: 'عمرو', khaled: 'خالد', khalid: 'خالد', hassan: 'حسن', hasan: 'حسن', hussein: 'حسين', hussien: 'حسين', hosny: 'حسني', hosni: 'حسني',
  hossam: 'حسام', hosam: 'حسام', hesham: 'هشام', hisham: 'هشام', hany: 'هاني', hani: 'هاني', hamdy: 'حمدي', hamdi: 'حمدي', hamada: 'حمادة', hamza: 'حمزة',
  ibrahim: 'إبراهيم', ebrahim: 'إبراهيم', ismail: 'إسماعيل', esmail: 'إسماعيل', islam: 'إسلام', eslam: 'إسلام', ayman: 'أيمن', aymen: 'أيمن', adel: 'عادل',
  adham: 'أدهم', akram: 'أكرم', alaa: 'علاء', ashraf: 'أشرف', atef: 'عاطف', bassem: 'باسم', basem: 'باسم', belal: 'بلال', bilal: 'بلال',
  diaa: 'ضياء', ehab: 'إيهاب', emad: 'عماد', essam: 'عصام', esam: 'عصام', fady: 'فادي', fadi: 'فادي', fares: 'فارس', farouk: 'فاروق', fathy: 'فتحي', fathi: 'فتحي',
  gamal: 'جمال', gamil: 'جميل', hatem: 'حاتم', haytham: 'هيثم', haitham: 'هيثم', hazem: 'حازم', helmy: 'حلمي', ibrahem: 'إبراهيم', kamal: 'كمال', karim: 'كريم',
  kareem: 'كريم', magdy: 'مجدي', magdi: 'مجدي', maher: 'ماهر', mahdy: 'مهدي', marwan: 'مروان', medhat: 'مدحت', mina: 'مينا', mena: 'مينا', mohsen: 'محسن',
  mounir: 'منير', mourad: 'مراد', morad: 'مراد', nabil: 'نبيل', nader: 'نادر', nasser: 'ناصر', nasr: 'نصر', osama: 'أسامة', ossama: 'أسامة', usama: 'أسامة',
  ramy: 'رامي', rami: 'رامي', ramadan: 'رمضان', reda: 'رضا', ridha: 'رضا', saad: 'سعد', sabry: 'صبري', sabri: 'صبري', said: 'سعيد', saeed: 'سعيد', sayed: 'سيد',
  sayyed: 'سيد', salah: 'صلاح', saleh: 'صالح', salem: 'سالم', samy: 'سامي', sami: 'سامي', samir: 'سمير', sameh: 'سامح', sherif: 'شريف', shrif: 'شريف',
  shady: 'شادي', shadi: 'شادي', tamer: 'تامر', tarek: 'طارق', tarik: 'طارق', tareq: 'طارق', wael: 'وائل', waleed: 'وليد', walid: 'وليد', yasser: 'ياسر',
  yaser: 'ياسر', yassin: 'ياسين', yassine: 'ياسين', yehia: 'يحيى', yahia: 'يحيى', yahya: 'يحيى', youssef: 'يوسف', yousef: 'يوسف', yousif: 'يوسف', joseph: 'جوزيف',
  ziad: 'زياد', zeyad: 'زياد', zyad: 'زياد', abdallah: 'عبدالله', abdullah: 'عبدالله', abdelrahman: 'عبدالرحمن', abdulrahman: 'عبدالرحمن', abdo: 'عبده',
  abdelaziz: 'عبدالعزيز', abdelhamid: 'عبدالحميد', abdelmoneim: 'عبدالمنعم', abdelfattah: 'عبدالفتاح', abdelhalim: 'عبدالحليم', abdel: 'عبد', abd: 'عبد',
  seif: 'سيف', saif: 'سيف', anas: 'أنس', moaz: 'معاذ', muaz: 'معاذ', malek: 'مالك', malik: 'مالك', mazen: 'مازن', nour: 'نور', noor: 'نور', taha: 'طه',
  galal: 'جلال', ezz: 'عز', ezzat: 'عزت', emam: 'إمام', fawzy: 'فوزي', fouad: 'فؤاد', hamed: 'حامد', hamid: 'حميد', ragab: 'رجب', shaban: 'شعبان', sobhy: 'صبحي',
  tawfik: 'توفيق', yasin: 'ياسين', zaki: 'زكي', zaky: 'زكي', george: 'جورج', peter: 'بيتر', michael: 'مايكل', mark: 'مارك', andrew: 'أندرو', john: 'جون',
  // women
  mona: 'منى', mai: 'مي', may: 'مي', mariam: 'مريم', maryam: 'مريم', mariem: 'مريم', marwa: 'مروة', menna: 'منة', mennah: 'منة', aya: 'آية', ayah: 'آية',
  amira: 'أميرة', amera: 'أميرة', asmaa: 'أسماء', asma: 'أسماء', basma: 'بسمة', bosy: 'بوسي', bossy: 'بوسي', dina: 'دينا', doaa: 'دعاء', dalia: 'داليا',
  eman: 'إيمان', iman: 'إيمان', esraa: 'إسراء', israa: 'إسراء', fatma: 'فاطمة', fatima: 'فاطمة', farah: 'فرح', habiba: 'حبيبة', hana: 'هنا', hanaa: 'هناء',
  heba: 'هبة', hend: 'هند', hind: 'هند', hoda: 'هدى', huda: 'هدى', jana: 'جنى', judy: 'جودي', lamia: 'لمياء', laila: 'ليلى', layla: 'ليلى', lina: 'لينا',
  lobna: 'لبنى', malak: 'ملك', manar: 'منار', mayar: 'ميار', nada: 'ندى', nadia: 'نادية', nahla: 'نهلة', nancy: 'نانسي', nermeen: 'نرمين', nermin: 'نرمين',
  nesma: 'نسمة', nihal: 'نهال', noha: 'نهى', nora: 'نورا', noura: 'نورا', nourhan: 'نورهان', omnia: 'أمنية', omneya: 'أمنية', rana: 'رنا', rania: 'رانيا',
  ranya: 'رانيا', rasha: 'رشا', reem: 'ريم', rim: 'ريم', rehab: 'رحاب', rawan: 'روان', radwa: 'رضوى', salma: 'سلمى', sara: 'سارة', sarah: 'سارة', samar: 'سمر',
  samah: 'سماح', shaimaa: 'شيماء', shimaa: 'شيماء', shahd: 'شهد', shereen: 'شيرين', sherin: 'شيرين', soha: 'سهى', somaya: 'سمية', yara: 'يارا', yasmin: 'ياسمين',
  yasmeen: 'ياسمين', yomna: 'يمنى', youmna: 'يمنى', zeinab: 'زينب', zainab: 'زينب', walaa: 'ولاء', wafaa: 'وفاء', sohila: 'سهيلة', sohaila: 'سهيلة', ghada: 'غادة',
  hagar: 'هاجر', hager: 'هاجر', heidi: 'هايدي', hadeer: 'هدير', hadir: 'هدير', kenzy: 'كنزي', karma: 'كارما', logy: 'لوجي', lojy: 'لوجي', mirna: 'ميرنا',
  marina: 'مارينا', mira: 'ميرا', nadine: 'نادين', nardeen: 'ناردين', nelly: 'نيللي', rodina: 'رودينا', roqaya: 'رقية', ruqaya: 'رقية', tasneem: 'تسنيم', tota: 'توتة',
  // family words and particles
  el: 'ال', al: 'ال', abu: 'أبو', abou: 'أبو', abo: 'أبو', bin: 'بن', ben: 'بن', bint: 'بنت', om: 'أم', um: 'أم', umm: 'أم', mr: 'أستاذ', mrs: 'مدام', ms: 'مدام',
  dr: 'دكتور', eng: 'باشمهندس', madam: 'مدام', hag: 'الحاج', haj: 'الحاج', hagga: 'الحاجة',
  // places, streets and address words often left in English
  abbas: 'عباس', akkad: 'العقاد', makram: 'مكرم', ebeid: 'عبيد', nahas: 'النحاس', zaker: 'ذاكر', tayaran: 'الطيران',
  abbasia: 'العباسية', zahraa: 'الزهراء', sheraton: 'شيراتون', masaken: 'مساكن', fakhry: 'فخري', fakhri: 'فخري',
  tagamo: 'التجمع', tagamoa: 'التجمع', tagammo: 'التجمع', tagamou: 'التجمع', banafseg: 'البنفسج', narges: 'النرجس', lotus: 'اللوتس',
  andalus: 'الأندلس', gharb: 'غرب', sharq: 'شرق', shark: 'شرق', golf: 'جولف', arabella: 'أرابيلا', mivida: 'ميفيدا', hyde: 'هايد', zayed: 'زايد',
  shorouk: 'الشروق', madinaty: 'مدينتي', mokattam: 'المقطم', maadi: 'المعادي', nozha: 'النزهة', ain: 'عين', shams: 'شمس', zamalek: 'الزمالك',
  dokki: 'الدقي', mohandessin: 'المهندسين', mohandseen: 'المهندسين', haram: 'الهرم', faisal: 'فيصل', october: 'أكتوبر', ganoub: 'جنوب', shamal: 'شمال',
  akademia: 'الأكاديمية', academy: 'الأكاديمية', banks: 'البنوك', police: 'الشرطة', army: 'الجيش', military: 'عسكري', engineers: 'المهندسين', doctors: 'الأطباء',
  teachers: 'المعلمين', judges: 'القضاة', journalists: 'الصحفيين', diplomats: 'الدبلوماسيين', youth: 'الشباب', family: 'العائلة', investors: 'المستثمرين',
  services: 'الخدمات', central: 'المركزي', main: 'الرئيسي', service: 'خدمة', gesr: 'جسر', suez: 'السويس', ring: 'الدائري', autostrad: 'الأوتوستراد',
  emtedad: 'امتداد', hay: 'حي', mogawra: 'مجاورة', mojawra: 'مجاورة', mogawara: 'مجاورة', manteqa: 'منطقة', mantika: 'منطقة', share3: 'شارع', shar3: 'شارع', sharia: 'شارع',
  emara: 'عمارة', '3emara': 'عمارة', dor: 'الدور', door: 'الدور', sha2a: 'شقة', shaqa: 'شقة', shaa: 'شقة', midan: 'ميدان', maydan: 'ميدان', kobry: 'كوبري',
  gam3a: 'جامعة', gamea: 'جامع', masged: 'مسجد', kenisa: 'كنيسة', madrasa: 'مدرسة', bawaba: 'بوابة', bwaba: 'بوابة', makhbaz: 'مخبز', saydalia: 'صيدلية',
};

// What is left: spelled out letter by letter, Egyptian style («Bassiouny» → «باسيوني»). Not perfect, but always Arabic,
// and staff can correct it on the transfer page (the correction is learned).
const PAIRS = [['sh', 'ش'], ['kh', 'خ'], ['gh', 'غ'], ['th', 'ث'], ['dh', 'ذ'], ['ch', 'تش'], ['ph', 'ف'], ['ck', 'ك'], ['ou', 'و'], ['oo', 'و'], ['ee', 'ي'],
  ['ei', 'ي'], ['ie', 'ي'], ['ai', 'اي'], ['ay', 'اي'], ['ey', 'ي'], ['aa', 'ا'], ['2', 'ء'], ['3', 'ع'], ['5', 'خ'], ['7', 'ح'], ['8', 'ق'], ['9', 'ص']];
const ONE = { b: 'ب', t: 'ت', g: 'ج', j: 'ج', h: 'ه', d: 'د', r: 'ر', z: 'ز', s: 'س', f: 'ف', q: 'ق', k: 'ك', l: 'ل', m: 'م', n: 'ن', w: 'و', y: 'ي', v: 'ف', p: 'ب', c: 'ك', x: 'كس' };
const VOW = 'aeiou';
const consRun = (w, i) => { let n = 0; while (i < w.length && !VOW.includes(w[i])) { const two = w.slice(i, i + 2); i += PAIRS.some(p => p[0] === two && !VOW.includes(two[0])) ? 2 : 1; n++; } return { n, end: i >= w.length }; };
export function translit(word) {
  let w = String(word).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!w || /^\d+$/.test(w)) return word;
  // «Abdelghany» → عبد + ال + …, «Elsayed» → ال + …
  const ab = w.match(/^abd[eu]?l(.{2,})$/); if (ab) return 'عبدال' + (NAMES[ab[1]] || translit(ab[1])).replace(/^ال/, '');
  const al = w.match(/^[ae]l(.{3,})$/); if (al && NAMES[al[1]]) return 'ال' + NAMES[al[1]].replace(/^ال/, '');
  if (w.length > 4 && /[^aeiou]at$/.test(w)) w = w.slice(0, -2) + 't';   // Medhat, Tharwat, Ezzat: no alef before the last t
  let out = '', i = 0;
  while (i < w.length) {
    const two = w.slice(i, i + 2), pair = PAIRS.find(p => p[0] === two);
    if (pair && !(/\d/.test(two[0]) && i === 0 && /^\d+$/.test(w))) { out += pair[1]; i += 2; continue; }
    const ch = w[i], first = i === 0, last = i === w.length - 1;
    if (/\d/.test(ch)) { out += ch; i++; continue; }
    if ('aeiou'.includes(ch)) {
      if (first) out += ch === 'e' || ch === 'i' ? 'إ' : ch === 'o' || ch === 'u' ? 'أ' : 'ا';
      else if (last) out += ch === 'a' ? 'ة' : ch === 'e' ? '' : ch === 'i' || ch === 'y' ? 'ي' : 'و';
      else if (ch === 'a') { const r = consRun(w, i + 1); out += r.n === 1 ? 'ا' : ''; }   // long before one consonant + vowel/end, short (unwritten) before two
      else if (ch === 'i') out += 'ي';
      else if (ch === 'o' || ch === 'u') out += 'و';
      i++; continue;
    }
    if (ch === 'y' && last) { out += 'ي'; i++; continue; }
    if (i > 0 && w[i - 1] === ch) { i++; continue; }   // a doubled letter is written once
    out += ONE[ch] || ''; i++;
  }
  return out || word;
}
