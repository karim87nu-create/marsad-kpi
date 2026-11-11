// English → Arabic for what customers type in English (Karim 01-11): addresses, names, comments — the way an Egyptian
// call-center employee would write them on Apex, not word for word. With an OpenAI key (config.openaiKey) the text is
// translated by the model; without it (or until the model answers) a dictionary turns the common address words into
// Arabic and leaves the rest as it is. Every answer is kept, so a text is translated once.
const LATIN = /[A-Za-z]{2,}/;

// Common address words (whole words, case-insensitive). Longer phrases first.
const WORDS = [
  ['in front of', 'أمام'], ['infront of', 'أمام'], ['in-front of', 'أمام'], ['opposite to', 'أمام'], ['opposite', 'أمام'], ['next to', 'بجوار'], ['beside', 'بجوار'],
  ['behind', 'خلف'], ['near', 'بالقرب من'], ['close to', 'بالقرب من'], ['above', 'فوق'], ['beneath', 'تحت'], ['corner of', 'ناصية'], ['corner', 'ناصية'],
  ['ground floor', 'الدور الأرضي'], ['first floor', 'الدور الأول'], ['second floor', 'الدور الثاني'], ['third floor', 'الدور الثالث'],
  ['street', 'شارع'], ['st\\.', 'ش'], ['st', 'ش'], ['road', 'طريق'], ['rd', 'طريق'], ['avenue', 'شارع'], ['ave', 'شارع'], ['axis', 'محور'], ['square', 'ميدان'],
  ['building', 'عمارة'], ['bldg', 'عمارة'], ['bld', 'عمارة'], ['tower', 'برج'], ['villa', 'فيلا'], ['house', 'بيت'], ['compound', 'كمبوند'], ['gate', 'بوابة'],
  ['entrance', 'مدخل'], ['block', 'بلوك'], ['zone', 'منطقة'], ['district', 'حي'], ['neighborhood', 'حي'], ['neighbourhood', 'حي'], ['area', 'منطقة'], ['sector', 'قطاع'],
  ['floor', 'الدور'], ['apartment', 'شقة'], ['apt', 'شقة'], ['flat', 'شقة'], ['unit', 'وحدة'], ['ground', 'أرضي'], ['roof', 'روف'], ['duplex', 'دوبلكس'],
  ['mall', 'مول'], ['cafe', 'كافيه'], ['restaurant', 'مطعم'], ['school', 'مدرسة'], ['university', 'جامعة'], ['mosque', 'مسجد'], ['church', 'كنيسة'],
  ['pharmacy', 'صيدلية'], ['hospital', 'مستشفى'], ['clinic', 'عيادة'], ['bank', 'بنك'], ['club', 'نادي'], ['hotel', 'فندق'], ['park', 'بارك'], ['market', 'ماركت'],
  ['supermarket', 'سوبر ماركت'], ['gas station', 'بنزينة'], ['station', 'محطة'], ['bridge', 'كوبري'], ['office', 'مكتب'], ['company', 'شركة'], ['bakery', 'مخبز'],
  ['north', 'الشمالية'], ['south', 'الجنوبية'], ['east', 'الشرقية'], ['west', 'الغربية'], ['new', 'الجديدة'], ['old', 'القديمة'],
  ['first', 'الأول'], ['second', 'الثاني'], ['third', 'الثالث'], ['fourth', 'الرابع'], ['fifth', 'الخامس'], ['sixth', 'السادس'], ['settlement', 'التجمع'],
  ['cairo', 'القاهرة'], ['giza', 'الجيزة'], ['egypt', 'مصر'], ['nasr city', 'مدينة نصر'], ['heliopolis', 'مصر الجديدة'], ['new cairo', 'القاهرة الجديدة'],
  ['madinaty', 'مدينتي'], ['rehab', 'الرحاب'], ['tagamoa', 'التجمع'], ['katameya', 'القطامية'], ['kattameya', 'القطامية'], ['maadi', 'المعادي'], ['zamalek', 'الزمالك'],
  ['mokattam', 'المقطم'], ['shorouk', 'الشروق'], ['obour', 'العبور'], ['katameya dunes', 'قطامية ديونز'], ['katameya heights', 'قطامية هايتس'], ['dunes', 'ديونز'], ['cluster', 'كلاستر'], ['hyde park', 'هايد بارك'], ['mivida', 'ميفيدا'], ['mountain view', 'ماونتن فيو'],
  ['makram ebeid', 'مكرم عبيد'], ['abbas el akkad', 'عباس العقاد'], ['abbas al akkad', 'عباس العقاد'], ['el nasr', 'النصر'], ['al nasr', 'النصر'], ['nasr', 'نصر'],
  ['and', 'و'], ['the', ''], ['of', ''], ['no\\.', 'رقم'], ['number', 'رقم'],
  // Complete phrases precede individual words so negatives keep their meaning.
  ["don't ring the bell", 'متضربش الجرس'], ['do not ring the bell', 'متضربش الجرس'], ['no onions', 'من غير بصل'],
  ['when you arrive', 'لما توصل'], ['on arrival', 'عند الوصول'], ['well done', 'تسوية كاملة'], ['not spicy', 'غير حار'],
  ['no spices', 'بدون توابل'], ['no salt', 'بدون ملح'], ['no sauce', 'بدون صوص'], ['sauce on the side', 'الصوص على جنب'],
  ['extra bread', 'عيش زيادة'], ['extra rice', 'أرز زيادة'], ['white rice', 'أرز أبيض'], ['basmati rice', 'أرز بسمتي'],
  ['rice with vermicelli', 'أرز بالشعرية'], ['with liver', 'بالكبدة'], ['with nuts', 'بالمكسرات'],
  ['bread', 'عيش'], ['onions', 'بصل'], ['onion', 'بصل'], ['pickles', 'مخلل'], ['sauce', 'صوص'], ['salt', 'ملح'],
  ['mohamed', 'محمد'], ['mohammed', 'محمد'], ['mohammad', 'محمد'], ['ahmed', 'أحمد'], ['mahmoud', 'محمود'],
  ['karim', 'كريم'], ['kareem', 'كريم'], ['ismail', 'إسماعيل'], ['baraka', 'بركة'], ['mona', 'منى'], ['hend', 'هند'],
  ['atia', 'عطية'], ['ali', 'علي'], ['hassan', 'حسن'], ['hussein', 'حسين'], ['omar', 'عمر'], ['youssef', 'يوسف'],
  // comments
  ['please', 'من فضلك'], ['call me', 'كلمني'], ['call', 'اتصل'], ['ring the bell', 'اضرب الجرس'], ["don't ring", 'متضربش الجرس'], ['no onion', 'من غير بصل'],
  ['without', 'من غير'], ['extra', 'زيادة'], ['spicy', 'حار'], ['no', 'من غير'], ['thanks', 'شكراً'], ['thank you', 'شكراً'],
].sort((a, b) => b[0].length - a[0].length);
const RX = WORDS.map(([en, ar]) => [new RegExp('(^|[^A-Za-z])' + en.replace(/ /g, '\\s+') + '(?=[^A-Za-z]|$)', 'gi'), ar]);

import { NAMES, translit } from './arabic-names.js';

// Words still in English after the dictionary: what staff taught (learned), a known name, else spelled out in Arabic
// (Karim 11-11 «اي الصعب في تعريب الاسم والعنوان تلقائي»). Acronyms (AUC, CFC) and codes with digits (B12) stay.
function arabizeRest(s, learned) {
  return s.replace(/[A-Za-z][A-Za-z0-9']*/g, (w, at, all) => {
    const k = w.toLowerCase().replace(/'/g, '');
    let v = learned?.get(k) || NAMES[k];
    if (!v) { if (/\d/.test(w) || (/^[A-Z]{2,4}$/.test(w)) || w.length < 2) return w; v = translit(w); }
    return all.slice(Math.max(0, at - 2), at) === 'ال' && v.startsWith('ال') ? v.slice(2) : v;
  });
}

function dictionary(text, learned) {
  let s = String(text).replace(/\bno\.?\s*(?=\d)/gi, 'رقم ');
  // «Makram Ebeid Street» / «El-Nasr Road» → «شارع …» / «طريق …» (the name after the word, as in Arabic).
  s = s.replace(/\b((?:(?:El|Al)[-\s])?[A-Z][A-Za-z']*(?:\s+[A-Z][A-Za-z']*){0,3})\s+(Street|St\.?|Road|Rd\.?|Axis)(?=[^A-Za-z]|$)/g,
    (m, name, w) => ({ street: 'شارع', st: 'شارع', 'st.': 'شارع', road: 'طريق', rd: 'طريق', 'rd.': 'طريق', axis: 'محور' })[w.toLowerCase()] + ' ' + name);
  s = s.replace(/\b(?:El|Al)[-\s](?=[A-Za-z])/g, 'ال');
  for (const [rx, ar] of RX) s = s.replace(rx, (m, pre) => pre + ar);
  s = arabizeRest(s, learned);
  return s.replace(/\s{2,}/g, ' ').replace(/\s+([،,])/g, '$1').trim();
}

const PROMPT = 'أنت موظف كول سنتر في مطعم في القاهرة بيكتب الأوردر على السيستم. حوّل النص ده للعربي المصري زي ما الموظف بيكتبه للطيار: ' +
  'العناوين بأسماء الأماكن المعروفة بالعربي (مثلاً Katameya Dunes = قطامية ديونز، Street 70 = شارع 70، infront of = أمام)، والأسماء الشخصية تتكتب بالعربي (Ismail Baraka = إسماعيل بركة)، ' +
  'والملاحظات بمعناها مش حرفي. سيب الأرقام والعربي اللي موجود زي ما هو، ومتزودش ولا تشيل معلومة. رجّع النص المترجم بس من غير أي شرح.';

export function setup(app) {
  const { db } = app;
  const key = () => app.config.openaiKey || null;
  const memo = new Map();   // this instance's answers (the table keeps them for every instance)

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
    const en = src.split(/\s+/).filter(Boolean), arw = ar.split(/\s+/).filter(Boolean);
    if (en.length === arw.length && en.length <= 8) for (let i = 0; i < en.length; i++) if (/^[A-Za-z][A-Za-z']+$/.test(en[i])) await save('w:' + en[i].toLowerCase().replace(/'/g, ''), arw[i], 'staff');
  };
  app.toArabic = async function toArabic(texts, { waitUntil, wait = false } = {}) {
    const have = await cached(texts), res = new Map(), learned = await learnedWords(texts);
    const todo = [];
    for (const t of new Set(texts.filter(Boolean))) {
      if (!LATIN.test(t)) { res.set(t, t); continue; }
      const c = have.get(t);
      if (c?.how === 'ai' || c?.how === 'staff') res.set(t, c.ar); else res.set(t, dictionary(t, learned));
      if ((!c || c.how !== 'ai') && key() && !busy.has(t)) todo.push(t);
    }
    await Promise.all([...res].filter(([t]) => LATIN.test(t) && !have.get(t)).map(([t, v]) => save(t, v, 'dict').catch(() => {})));
    const run = async t => { busy.add(t); try { const v = await ai(t); if (v) { await save(t, v, 'ai'); res.set(t, v); } } finally { busy.delete(t); } };
    if (todo.length) {
      if (wait) await Promise.all(todo.slice(0, 8).map(run));
      else if (waitUntil) waitUntil(Promise.all(todo.slice(0, 6).map(run)));
    }
    return res;
  };
  app.arabicDictionary = dictionary;
}
