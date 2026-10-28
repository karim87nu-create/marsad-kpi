const id = value => {
  const s = String(value ?? '').trim().replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660));
  return /^\d+$/.test(s) ? s : '';
};
export const apexReceipt = order => id(order?.sn) || 'غير متاح';
export const talabatReference = order => 'رقم أوردر طلبات: ' + (id(order?.id) || 'غير متاح') +
  '\nهاشتاج طلبات: ' + (id(order?.code) ? '#' + id(order.code) : 'غير متاح');
export const siteReference = order => 'رقم أوردر الموقع: ' + (id(order?.id) || 'غير متاح');

// Apex database IDs and receipt numbers are never platform identifiers. Partial numbers are never identifiers.
export function referenceEvidence(order, apex) {
  const source = order.source, expectedKind = { talabat: 'طلبات', site: 'الموقع' }[source];
  if (!expectedKind) return { exact: false, conflict: false, type: null };
  if (apex.kind && apex.kind !== expectedKind) return { exact: false, conflict: true, type: 'source' };
  const refs = apex.sourceRefs?.[source] || {}, pairs = [];
  const legacyTag = id(String(apex.tag ?? '').replace(/^#\s*/, ''));
  if (source === 'talabat') {
    // The legacy tag on a Talabat order is a short hashtag only; it is never compared to the full order ID.
    const code = id(refs.code) || (legacyTag.length <= 8 ? legacyTag : '');
    if (code && id(order.code)) pairs.push({ type: 'talabatCode', equal: code === id(order.code) });
    if (id(refs.orderId)) pairs.push({ type: 'talabatOrderId', equal: id(refs.orderId) === id(order.id) });
  } else {
    const siteId = id(refs.orderId) || legacyTag;
    if (siteId) pairs.push({ type: 'siteOrderId', equal: siteId === id(order.id) });
  }
  return { exact: pairs.some(p => p.equal), conflict: pairs.some(p => !p.equal), type: pairs.map(p => p.type).join(',') || null };
}

export function apexAlertText(text, order) {
  if (!order) return text;
  const internal = id(order.no), receipt = apexReceipt(order);
  return String(text).replace(/أوردر\s+(\d+)/gu, (whole, number) =>
    number === internal || number === id(order.sn) ? 'أوردر Apex ' + receipt : whole);
}

// Normalize already queued platform alerts at delivery too, without modifying their stored history.
export function platformAlertText(text, kind, key) {
  let value = String(text || '');
  if (!/^talabat|^site/.test(kind || '')) return value;
  value = value.split(/\r?\n/).filter(line => !/^رقمه على Apex:/u.test(line)).join('\n');
  if (/^talabat/.test(kind || '')) {
    const match = /talabat:(?:notEntered|cancel|items):(\d+)/.exec(String(key));
    value = value.replace(/رقم أوردر طلبات:\s*#(\d+)/gu, 'هاشتاج طلبات: #$1');
    value = value.replace(/أوردر طلبات #(\d+)/gu, 'هاشتاج طلبات #$1');
    if (match && !new RegExp('رقم أوردر طلبات: '+match[1]+'(?:\\D|$)').test(value)) value += '\nرقم أوردر طلبات: ' + match[1];
    value = value.replace(/— أوردر \d+/gu, '');
  }
  return value;
}
