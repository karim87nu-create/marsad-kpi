'use strict';
const out = document.getElementById('status');
const time = v => v ? new Date(v).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) : '—';
async function refresh() {
  try {
    const s = await browser.runtime.sendMessage({ type: 'COLLECTOR_STATUS' });
    out.textContent = [s.linked ? 'الموصل مربوط' : 'الموصل غير مربوط', s.linked ? s.message : '', 'آخر سجل: ' + time(s.lastHistory), s.historyError ? '⚠ مشكلة السجل: ' + s.historyError : '', 'آخر انتظار مباشر: ' + time(s.lastLive), s.liveError ? '⚠ مشكلة الانتظار: ' + s.liveError : '', 'أحداث في الانتظار: ' + s.pending, 'الإصدار ' + s.version].filter(Boolean).join('\n');
  } catch { out.textContent = 'تعذر التواصل مع الإضافة'; }
}
document.getElementById('sync').onclick = async () => { out.textContent = 'جارٍ السحب…'; await browser.runtime.sendMessage({ type: 'COLLECTOR_SYNC' }).catch(() => {}); refresh(); };
document.getElementById('stop').onclick = async () => { if (!confirm('إيقاف سحب السجل من الجهاز ده؟')) return; await browser.runtime.sendMessage({ type: 'COLLECTOR_STOP' }).catch(() => {}); refresh(); };
refresh(); setInterval(refresh, 3000);
