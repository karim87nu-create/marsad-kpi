// Read-only interpretation of customer-card Notes from APEX.
// Never grant a financial discount, add a product or clear a note from text alone.
// Staff and the live APEX writer must verify the customer's current entitlement.
const digits = x => String(x || '').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x6f0));
function interpretApexCustomerNote(input) {
  const raw = digits(input).trim().slice(0,500);
  if (!raw || raw === '.' || raw === '-') return { text:'', category:'empty', oneTime:false, actions:[], requiresReview:false };
  const norm = raw.replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/\s+/g,' ').toLowerCase();
  const actions = [];
  const pct = [...norm.matchAll(/(?:خصم|discount)\s*[:：-]?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:%|٪|بالم[يئ]ة|في\s*الم[يئ]ة|percent)/gi)];
  const amounts = [...norm.matchAll(/(?:خصم|discount)\s*[:：-]?\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:جنيه|جنيها|ج\b|egp|le\b)/gi)];
  if (pct.length === 1 && +pct[0][1].replace(',','.') > 0 && +pct[0][1].replace(',','.') <= 100) actions.push({kind:'discount_percent',value:+pct[0][1].replace(',','.'),label:pct[0][0]});
  if (amounts.length === 1 && +amounts[0][1].replace(',','.') > 0) actions.push({kind:'discount_amount',value:+amounts[0][1].replace(',','.'),label:amounts[0][0]});
  // Entitlement to items is never guessed into an APEX item code or price.
  if (/(?:ليه|لها|له|يستحق|هدية|هديه|مجاني|صنف|اصناف|أصناف|قطعة|قطعه|اضافة|إضافة)\s+.{0,90}/i.test(norm)) actions.push({kind:'items_to_verify',label:raw});
  const maybeDiscount = /خصم|discount|٪|\d\s*%/i.test(norm);
  const conflicting = (pct.length > 1 || amounts.length > 1 || (pct.length && amounts.length)) ||
    (maybeDiscount && !actions.some(a=>a.kind.startsWith('discount_')));
  const oneTime = /(?:للاوردر\s*(?:ده|دا|الحالي|فقط)|للطلب\s*(?:ده|دا|الحالي|فقط)|مرة\s*واحدة|مره\s*واحده|هذا\s*الطلب\s*فقط|single\s*order|one\s*time)/i.test(norm);
  return {text:raw,category:conflicting?'ambiguous':actions.length?'actionable':'instructions',
    oneTime, actions, requiresReview:true, conflicting};
}
export { interpretApexCustomerNote };
