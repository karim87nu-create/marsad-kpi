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
  // comments
  ['please', 'من فضلك'], ['call me', 'كلمني'], ['call', 'اتصل'], ['ring the bell', 'اضرب الجرس'], ["don't ring", 'متضربش الجرس'], ['no onion', 'من غير بصل'],
  ['without', 'من غير'], ['extra', 'زيادة'], ['spicy', 'حار'], ['no', 'من غير'], ['thanks', 'شكراً'], ['thank you', 'شكراً'],
].sort((a, b) => b[0].length - a[0].length);
const RX = WORDS.map(([en, ar]) => [new RegExp('(^|[^A-Za-z])' + en.replace(/ /g, '\\s+') + '(?=[^A-Za-z]|$)', 'gi'), ar]);

function dictionary(text) {
  let s = String(text);
  // «Makram Ebeid Street» / «El-Nasr Road» → «شارع …» / «طريق …» (the name after the word, as in Arabic).
  s = s.replace(/\b((?:(?:El|Al)[-\s])?[A-Z][A-Za-z']*(?:\s+[A-Z][A-Za-z']*){0,3})\s+(Street|St\.?|Road|Rd\.?|Axis)(?=[^A-Za-z]|$)/g,
    (m, name, w) => ({ street: 'شارع', st: 'شارع', 'st.': 'شارع', road: 'طريق', rd: 'طريق', 'rd.': 'طريق', axis: 'محور' })[w.toLowerCase()] + ' ' + name);
  s = s.replace(/\b(?:El|Al)[-\s](?=[A-Za-z])/g, 'ال');
  for (const [rx, ar] of RX) s = s.replace(rx, (m, pre) => pre + ar);
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
    await db.prepare('INSERT INTO translations (src, ar, how, at) VALUES (?,?,?,?) ON CONFLICT(src) DO UPDATE SET ar = excluded.ar, how = excluded.how, at = excluded.at WHERE translations.how <> \'ai\' OR excluded.how = \'ai\'')
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
  app.toArabic = async function toArabic(texts, { waitUntil, wait = false } = {}) {
    const have = await cached(texts), res = new Map();
    const todo = [];
    for (const t of new Set(texts.filter(Boolean))) {
      if (!LATIN.test(t)) { res.set(t, t); continue; }
      const c = have.get(t);
      if (c) res.set(t, c.ar); else res.set(t, dictionary(t));
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
