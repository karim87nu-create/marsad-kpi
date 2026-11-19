// Karim 11-19 «التعديلات تبقي في اعدادات الاداره بدل كل شويه تحديث نشر وتبقي سهله ومفهومه»: the numbers and word lists
// that were fixed in the code, changed from «الإدارة ← إعدادات التشغيل» with no publish. Each one says in plain words what
// it changes; «رجّع الأصلي» puts the original back. Read by every server copy within a minute.
export const TUNE_DEFS = [
  // group, key, label, help, default, min, max
  { group: 'التحويل الآلي', key: 'autoMaxAgeMin', label: 'أقصى عمر للأوردر عشان يتحوّل آلي (دقيقة)', help: 'أوردر أقدم من كده بيتساب للموظف (غالباً اتسجل بإيد). كبّره لو أوردرات كتير بتتساب وهي ما اتسجلتش.', def: 20, min: 5, max: 60 },
  { group: 'التحويل الآلي', key: 'scheduledLeadMin', label: 'أوردر الموقع اللي بميعاد يتحوّل قبل ميعاده بـ (دقيقة)', help: 'الفرع بيستلمه على Apex قبل الميعاد بالمدة دي. الميعاد بيتكتب جنب الاسم.', def: 60, min: 15, max: 240 },
  { group: 'التحويل الآلي', key: 'writerStuckMin', label: 'لو جهاز الكاشير ماسجلش أوردر من (دقيقة) — الجديد يروح للموظف', help: 'لما جهاز الكاشير يقف، الأوردرات الجديدة بتتساب للموظفين بدل ما تستناه.', def: 4, min: 2, max: 30 },
  { group: 'رسايل التليجرام', key: 'transferStuckMin', label: '«جهاز الكاشير مارد» بعد (دقيقة)', help: 'رسالة للأونلاين لما أوردر اتبعت لجهاز الكاشير ومارد عليه.', def: 3, min: 2, max: 30 },
  { group: 'رسايل التليجرام', key: 'talabatNotEnteredMin', label: '«أوردر طلبات اتقبل ولسه ماتضربش على Apex» بعد (دقيقة)', help: 'من وقت القبول على طلبات.', def: 10, min: 3, max: 60 },
  { group: 'رسايل التليجرام', key: 'siteTransferMin', label: '«أوردر الموقع ولسه ماتحوّلش لفرع» بعد (دقيقة)', help: 'من وقت وصوله على الموقع.', def: 5, min: 2, max: 60 },
  { group: 'رسايل التليجرام', key: 'sitePrepMin', label: '«أوردر الموقع عدّى وقت التحضير ولسه ماخرجش» بعد (دقيقة)', help: 'من وقت تحويله للفرع. للفرع.', def: 30, min: 10, max: 120 },
];
// Word lists for the cashier PC's «the customer asked for something we don't have» check (sent to it every 10 minutes).
export const TUNE_LISTS = [
  { key: 'foodWords', label: 'أكلات مش عندنا (الأوردر يقف ويتصل بالعميل)', help: 'لو العميل طلب كلمة من دول بدل حاجة («فريك بدل الرز») والكلمة مش في أصناف Apex، الأوردر بيرجع لصفحة التحويل أول مرة. اكتب الكلمة زي ما العميل بيكتبها.' },
  { key: 'okWords', label: 'كلام عادي مايوقفش الأوردر أبداً', help: 'لو أوردر وقف على كلمة مش أكلة (زي «كبيره»)، ضيفها هنا.' },
];
export const TUNE = Object.fromEntries(TUNE_DEFS.map(d => [d.key, d.def]));
export const TUNE_WORDS = { foodWords: [], okWords: [] };
const word = w => String(w || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ٟـ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
export function applyTune(saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  for (const d of TUNE_DEFS) { const v = Number(s.values?.[d.key]); TUNE[d.key] = Number.isInteger(v) && v >= d.min && v <= d.max ? v : d.def; }
  for (const l of TUNE_LISTS) TUNE_WORDS[l.key] = [...new Set((Array.isArray(s.words?.[l.key]) ? s.words[l.key] : []).map(word).filter(w => w.length >= 2))].slice(0, 500);
  return { values: { ...TUNE }, words: { foodWords: [...TUNE_WORDS.foodWords], okWords: [...TUNE_WORDS.okWords] } };
}
export { word as tuneWord };
