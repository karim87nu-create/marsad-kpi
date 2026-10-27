// Branch recipients need fulfillment details, not order-entry staff or entry clock time.
// Apply at delivery too, so already queued messages from older monitors follow the policy.
export function branchMessage(text) {
  return String(text || '').split(/\r?\n/).flatMap(line => {
    if (/^\s*(?:[👤🕒⏰]\s*)?(?:اللي ضرب(?: الأوردر|هم)?|ضربه|وقت (?:ضرب|إدخال) الأوردر|موظف الإدخال|entered by|entry time)\s*[:：]?/iu.test(line)) return [];
    if (/^\s*اتضرب الساعة\s/u.test(line)) {
      const duration = /(?:و)?بقاله\s+[^،\n]+/u.exec(line);
      return duration ? [duration[0].replace(/^و/, '')] : [];
    }
    if (/^\s*رقمه على Apex:/u.test(line)) return [line.replace(/(?:[،·]\s*ضربه|\s+الساعة)\s.*$/u, '').trimEnd()];
    return [line];
  }).join('\n');
}
