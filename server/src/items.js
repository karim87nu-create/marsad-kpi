// أصناف الأوردر: Talabat names its dishes in English, Apex in Arabic. A dish is matched by
//  1) what the monitor learned from orders whose items all matched (Talabat name → Apex item number),
//  2) the starting list below (the dishes seen on 25-10-2026, weights told apart by price),
//  3) word by word translation of the dish name,
// always with the same quantity and a price that fits (Talabat shows the price with tax: about 1.13 × Apex).
const SEED = {
  'stuffed pigeon with rice - piece': ['0107006'], 'grilled half chicken meal offer': ['0116003'], 'half grilled chicken on charcoal': ['0107001'],
  'pepsi can': ['0202001'], '7 up can': ['0202002'], 'miranda cans': ['0202003'], 'orzo soup': ['0102001'], 'lentil soup': ['0102006'], 'vegetable soup': ['0102008'],
  'cream of chicken soup': ['0102002'], 'cream of mushroom soup': ['0102003'], 'pigeon soup': ['0102004', '0102005'], 'shish tawook meal offer': ['0116004'], 'hawawshi offer': ['111'],
  'rice pudding': ['0201001'], 'oven baked pasta': ['0103017'], 'kofta and molokhia meal offer': ['315'], '1/4 grilled kofta offer': ['218'],
  'mutton ribs': ['0108028', '0108026', '0108025'], 'veal ribs': ['0108032', '0108030'], 'tahini salad': ['0101001'], 'pickled eggplant': ['0101007'],
  'marinated tomatoes': ['0101003'], 'oriental salad': ['0101002'], 'pickled cucumber': ['0101005'], 'oriental pickles': ['0101009'], 'garlic dip': ['0101006'],
  'kofta meal offer': ['0116001'], 'baladi sausage': ['0108044', '0108043'], 'om ali': ['0201002'], 'kofta': ['0108004', '0108003', '0108002', '0108001'],
  'mix grill': ['0108036', '0108035', '0108034'], 'grape leaves': ['0103002'], 'molokhia casserole': ['0106007'], 'white rice': ['0103007'], 'basmati rice': ['0103010'],
  'nefa': ['0108040', '0108039'], 'half shish chicken': ['0107002'], 'large mixed grill platter offer': ['0116010'],
  'kebab and kofta - lamb': ['0108012', '0108011', '0108010', '0108009'], 'kebab and kofta - veal': ['0108016', '0108015', '0108014', '0108013'],
  'chicken pane sandwich': ['0104013', '0104014'], 'sausage sandwich': ['0104005'], 'grilled chicken breasts': ['0107012', '0107011', '0107010', '0107009'],
  'mixed stuffed vegetables': ['0103004'], 'oven-baked rice casserole with meat': ['0106018'], "kids' pane chicken meal": ['0110001', '0110002'], 'half chicken meal': ['0109003'],
  'quarter grilled chicken': ['0107005'], 'french fries': ['0103005'], 'moussaka casserole': ['0106001'], 'shish tawook': ['0107020', '0107019', '0107018'],
  'tarb': ['0108008', '0108007', '0108006'], 'potato tagine': ['0106002'], 'plain baked rice casserole': ['0106005'], 'potato tagine with meat': ['0106012'],
  'kebab sandwich combo': ['0104012'], 'spaghetti neapolitan': ['0103016'],
};
// Word translations for dishes not seen yet.
const WORDS = {
  grilled: 'مشوي', grill: 'جريل', kofta: 'كفته', kebab: 'كباب', chicken: 'فراخ', rice: 'ارز', soup: 'شوربه', salad: 'سلطه', sandwich: 'ساندوتش', combo: 'كومبو',
  meal: 'وجبه', offer: 'عرض', casserole: 'طاجن', tagine: 'طاجن', pasta: 'مكرونه', lamb: 'ضاني', mutton: 'ضاني', veal: 'بتلو', ribs: 'ريش', liver: 'كبده', sausage: 'سجق',
  pigeon: 'حمام', quail: 'سمان', mixed: 'مشكل', mix: 'ميكس', breasts: 'صدور', breast: 'صدور', shish: 'شيش', tawook: 'طاووق', molokhia: 'ملوخيه', okra: 'باميه',
  potato: 'بطاطس', potatoes: 'بطاطس', fries: 'بطاطس', tray: 'صينيه', platter: 'صينيه', steak: 'استيك', hawawshi: 'حواوشي', fatta: 'فته', fattah: 'فته', trotters: 'كوارع',
  tahini: 'طحينه', garlic: 'توميه', pickled: 'مخلل', pickles: 'مخلل', eggplant: 'باذنجان', yogurt: 'زبادي', spaghetti: 'اسباجتي', bolognese: 'بلونيز', mombar: 'ممبار',
  vegetables: 'خضار', vegetable: 'خضار', stuffed: 'محشي', grape: 'عنب', leaves: 'ورق', water: 'مياه', pepsi: 'بيبسي', diet: 'دايت', moussaka: 'مسقعه', meat: 'لحمه',
  pane: 'بانيه', kids: 'اطفال', half: 'نصف', quarter: 'ربع', orzo: 'لسان', lentil: 'عدس', mushroom: 'مشروم', cream: 'كريمه', basmati: 'بسمتي', white: 'سادة',
  vine: 'عنب', mahashi: 'محشي', khalta: 'خلطه', plain: 'ساده', up: 'سفن', mirinda: 'ميرندا', miranda: 'ميرندا', apple: 'تفاح', orange: 'برتقال', baba: 'بابا', ghanoush: 'غنوج',
  ghannoug: 'غنوج', cucumber: 'خيار', marinated: 'متبله', sesame: 'طحينه', fillet: 'فيليه', knuckles: 'كوارع', kaware: 'كوارع', fatteh: 'فته', boneless: 'مخليه', onions: 'بصل',
  mineral: 'مياه', dip: 'توميه', caramel: 'كراميل', ali: 'علي', om: 'ام', um: 'ام', felto: 'فيلتو', tabk: 'طبق',
  baladi: 'بلدي', oriental: 'بلدي', tomatoes: 'طماطم', tomato: 'طماطم', sweet: 'حلو', pudding: 'لبن', nefa: 'نيفه', tarb: 'طرب', alexandrian: 'اسكندراني', sobia: 'سوبيا',
};
const ar = s => String(s || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ًٌٍَُِّْ]/g, '').toLowerCase();
const key = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const variantKey = s => key(ar(s)).split(/[^\p{L}\p{N}]+/u).filter(w => w && !['meal','offer','combo'].includes(w)).sort().join(' ');
const SEED_VARIANTS = new Map();
for (const [name, ids] of Object.entries(SEED)) {
  const k = variantKey(name);
  SEED_VARIANTS.set(k, [...new Set([...(SEED_VARIANTS.get(k) || []), ...ids])]);
}
// How well an English dish name fits an Arabic item name, 0..1, by translated words.
function wordScore(en, arName) {
  const words = key(en).split(/[^a-z]+/).filter(w => w.length > 2 && !['with','and','the','for','from'].includes(w));
  if (!words.length) return 0;
  const a = ar(arName);
  const weight = w => ['meal','offer','combo'].includes(w) ? 0.5 : 1;
  return words.reduce((n, w) => n + (WORDS[w] && a.includes(ar(WORDS[w]).slice(0, Math.max(3, ar(WORDS[w]).length - 1))) ? weight(w) : 0), 0) /
    words.reduce((n, w) => n + weight(w), 0);
}

// talabat: [{ qty, name, price (line total with tax) }], apex: [{ no, name, qty, price (unit, before tax) }]
// learned: Map(talabat name → Map(apex no → evidence)), ratio: Talabat/Apex price ratio (learned, about 1.13).
function compareItems(talabat, apex, { learned = new Map(), ratio = 1.13 } = {}) {
  const T = talabat.map((x, i) => ({ ...x, i, unit: x.price && x.qty ? x.price / x.qty : null })), A = apex.map((x, i) => ({ ...x, i }));
  const usedA = new Set(), pairs = [];
  const known = t => [...(learned.get(key(t.name))?.keys() || []), ...(SEED[key(t.name)] || []), ...(SEED_VARIANTS.get(variantKey(t.name)) || [])];
  // Names and quantities identify dishes; menu prices drift a little, so only a price far off
  // the usual Talabat/Apex ratio (wrong weight or size, e.g. 1/4 vs 1/2 kilo) blocks a match.
  const priceFar = (t, a) => !!(t.unit && a.price) && Math.abs(t.unit / a.price - ratio) / ratio > 0.25;
  for (const pass of ['known', 'words']) for (const t of T) {
    if (pairs.some(p => p.t === t)) continue;
    let best = null, bestScore = 0, tied = false;
    for (const a of A) {
      if (usedA.has(a.i) || Math.abs((a.qty || 1) - (t.qty || 1)) > 0.01) continue;
      const k = known(t).includes(String(a.no).trim());
      // Talabat can expose Arabic labels too. Match identical normalized names
      // directly, while keeping the same quantity and price checks as other paths.
      const sameName = key(ar(t.name)) === key(ar(a.name)) && key(ar(t.name));
      const s = priceFar(t, a) ? 0 : sameName ? 2 : pass === 'known' ? (k ? 2 : 0) : wordScore(t.name, a.name);
      if (s > bestScore) { best = a; bestScore = s; tied = false; }
      else if (s > 0 && s === bestScore && String(a.no) !== String(best?.no)) tied = true;
    }
    if (best && !tied && (pass === 'known' || bestScore >= 0.65)) { usedA.add(best.i); pairs.push({ t, a: best, how: pass }); }
  }
  const missingOnApex = T.filter(t => !pairs.some(p => p.t === t)), extraOnApex = A.filter(a => !usedA.has(a.i));
  // Quantities: the same dishes in other counts.
  const qty = (l, k) => l.reduce((n, x) => n + (Number(x[k]) || 1), 0);
  // A collapsed Talabat product can hide selected add-ons. Apex may store those as
  // separate detail rows; keep those reviewable until the full modifier list is confirmed.
  const modifierContext = T.some(t => t.modifierRead !== true || t.modifierComplete !== true);
  // Only count an Apex detail row as a Talabat add-on when the modifier list was fully expanded,
  // the displayed modifier name matches exactly, and its quantity equals the parent quantity.
  if (T.some(t => t.modifierRead === true && t.modifierComplete === true && Array.isArray(t.modifiers))) {
    for (const t of T.filter(x => x.modifierRead === true && x.modifierComplete === true && Array.isArray(x.modifiers))) {
      for (const modifier of t.modifiers) {
        const parts = /^(?:(\d+(?:\.\d+)?)\s*[x×]\s*)?(.+?)(?:\s*[x×]\s*(\d+(?:\.\d+)?))?$/i.exec(String(modifier).trim());
        const modifierName = (parts?.[2] || String(modifier)).trim(), modifierQty = Number(parts?.[1] || parts?.[3] || t.qty || 1);
        const a = A.find(x => !usedA.has(x.i) && Math.abs((x.qty || 1) - modifierQty) <= 0.01 && key(ar(x.name)) === key(ar(modifierName)));
        if (a) usedA.add(a.i);
      }
    }
  }
  const unmatchedApex = A.filter(a => !usedA.has(a.i));
  extraOnApex.length = 0; extraOnApex.push(...unmatchedApex);
  // An extra Apex row that is the known dish of a missing Talabat line, blocked only by its price,
  // is the wrong weight or size of that dish, not a hidden add-on.
  const wrongSize = extraOnApex.filter(a => missingOnApex.some(t => known(t).includes(String(a.no).trim()) && priceFar(t, a)));
  const modifierUncertain = extraOnApex.length > wrongSize.length && modifierContext;
  const uncertain = modifierUncertain || missingOnApex.some(t => !known(t).length && !A.some(a => wordScore(t.name, a.name) >= 0.65));
  return { ok: !missingOnApex.length && !extraOnApex.length, uncertain, modifierUncertain, wrongSize: wrongSize.map(a => (a.qty || 1) + '× ' + a.name), pairs: pairs.map(p => ({ talabat: p.t.name, apex: p.a.name, apexNo: p.a.no, how: p.how, ratio: p.t.unit && p.a.price ? p.t.unit / p.a.price : null })),
    missingOnApex: missingOnApex.map(t => t.qty + '× ' + t.name), extraOnApex: extraOnApex.map(a => (a.qty || 1) + '× ' + a.name),
    countTalabat: qty(talabat, 'qty'), countApex: qty(apex, 'qty'),
    unmatched: { talabat: missingOnApex.map(({ qty, name, price }) => ({ qty, name, price })), apex: extraOnApex.map(({ no, name, qty, price }) => ({ no, name, qty, price })) } };
}

// The Apex item numbers a Talabat dish name is known to be (learned from sure links, or the starting list).
const knownNos = (name, learned = new Map()) => [...new Set([...(learned.get(key(name))?.keys() || []), ...(SEED[key(name)] || []), ...(SEED_VARIANTS.get(variantKey(name)) || [])].map(x => String(x).trim()))];
export { compareItems, wordScore, knownNos, SEED, WORDS, key as itemKey };

