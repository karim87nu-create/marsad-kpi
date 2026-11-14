// Only an authenticated manual submission can override source payment.
// Match the observed method so an old browser confirmation cannot override newer evidence.
export function sitePaymentChoice(method, payment, confirmation, manual = false) {
  if (!['cash', 'paid'].includes(payment)) return { error: 'حدد: كاش ولا مدفوع' };
  if (method === 'mixed') return { error: 'جزء مدفوع أونلاين والباقي كاش — سجّله على Apex بإيدك' };
  const expected = method === 'cod' ? 'cash' : method === 'online' ? 'paid' : null;
  const conflict = (expected && payment !== expected) || method === 'online-unpaid';
  if (!conflict) return { override: null };
  if (manual && confirmation?.from === method && confirmation?.to === payment && confirmation?.confirmed === true) {
    return { override: { from: method, to: payment } };
  }
  return { error: 'طريقة الدفع مختلفة عن الموقع — حدّث الصفحة وأكّد تغيير طريقة الدفع قبل التحويل' };
}
