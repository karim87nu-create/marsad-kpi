// Only an authenticated manual submission can override source payment.
// Match the observed method so an old browser confirmation cannot override newer evidence.
export function sitePaymentChoice(method, payment, confirmation, manual = false, zeroTotal = false) {
  if (!['cash', 'paid'].includes(payment)) return { error: 'حدد: كاش ولا مدفوع' };
  if (zeroTotal) return { override: null };   // the customer pays nothing: the way it is paid does not matter
  const expected = method === 'cod' || method === 'mixed' ? 'cash' : method === 'online' ? 'paid' : null;
  const conflict = (expected && payment !== expected) || method === 'online-unpaid';
  if (!conflict) return { override: null };
  if (manual && confirmation?.from === method && confirmation?.to === payment && confirmation?.confirmed === true) {
    return { override: { from: method, to: payment } };
  }
  return { error: 'طريقة الدفع مختلفة عن الموقع — حدّث الصفحة وأكّد تغيير طريقة الدفع قبل التحويل' };
}
