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
  if (/(?:هدية|هديه|مجاني|صنف مجاني|اصناف مجانيه|قطعة مجانية|قطعه مجانيه|(?:ليه|لها|له|يستحق)\s+(?:\d+\s+)?(?:صنف|اصناف|قطعة|قطعه|وجبة|وجبه|مشروب|هدية|هديه))/i.test(norm)) actions.push({kind:'items_to_verify',label:raw});
  const maybeDiscount = /خصم|discount|٪|\d\s*%/i.test(norm);
  const conflicting = !!(pct.length > 1 || amounts.length > 1 || (pct.length && amounts.length)) ||
    (maybeDiscount && !actions.some(a=>a.kind.startsWith('discount_')));
  const oneTime = /(?:للاوردر\s*(?:ده|دا|الحالي|فقط)|للطلب\s*(?:ده|دا|الحالي|فقط)|مرة\s*واحدة|مره\s*واحده|هذا\s*الطلب\s*فقط|single\s*order|one\s*time)/i.test(norm);
  // Clear only a note explicitly marked one-order-only whose complete text can be consumed.
  // Mixed permanent instructions must never be erased along with a one-time entitlement.
  const hasPermanent = /(?:دائم|دايم|كل\s*(?:مرة|مره|اوردر|أوردر|طلب)|على\s*طول|علي\s*طول|ثابت|every\s*order|always)/i.test(norm);
  const multipleInstructions = /[\n;؛|]/.test(raw);
  const clearable = oneTime && !hasPermanent && !multipleInstructions && !conflicting;
  return {text:raw,category:conflicting?'ambiguous':actions.length?'actionable':'instructions',
    oneTime, clearable, actions, requiresReview:true, conflicting};
}
export { interpretApexCustomerNote };
