// One name per Talabat branch (Karim 01-11): the live screen and an English screen name the branches differently
// («الدهان، مدينتي…», «El Dahan, Madinaty - South Park»). All become the name Order History has always used (as stored
// on 31-10-2026), so what the monitor learned about each branch keeps working. Not a branch name (the monitor's own
// banner was once read as one): dropped.
const CANON = [
  [/madinaty|مدينتي/i, 'الدهان, مدينتي - ساوث بارك'],
  [/makram|city\s*stars?|مكرم|سيتي ستار/i, 'الدهان سيتي ستار مول، مكرم عبيد'],
  [/tagam+o?a|banafs|التجمع|البنفسج/i, 'الدهان، التجمع الخامس - البنفسج 9,10,11,12'],
];
export const canonicalStore = s => {
  if (!s) return null;
  const t = String(s).trim();
  if (/شاشة مراقبة|مرصد الدهان/.test(t)) return null;
  if (/الدهان|dahan/i.test(t)) for (const [re, name] of CANON) if (re.test(t)) return name;   // full store names only
  return t.slice(0, 160);
};
