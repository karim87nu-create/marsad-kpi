'use strict';
// واتساب المرصد: on the Talabat monitor PC only, a WhatsApp Web tab (the restaurant's number linked as a device) sends
// the welcome and survey messages the server hands out, one at a time at a person's pace. It never reads chats; it only
// opens the send link for the customer's number with the message filled in, presses send, and says if it went.
(async () => {
  if (location.hostname !== 'web.whatsapp.com' || window.top !== window || window.__marsadWa === globalThis.MARSAD.VERSION) return;
  window.__marsadWa = globalThis.MARSAD.VERSION;
  const bg = m => browser.runtime.sendMessage(m);
  let state; try { state = await bg({ type: 'TALABAT_WA_ACTIVE' }); } catch { return; }
  if (!state?.active) return;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const KEY = 'marsadWaJob';
  const job = { get() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } }, set(v) { try { v ? sessionStorage.setItem(KEY, JSON.stringify(v)) : sessionStorage.removeItem(KEY); } catch {} } };

  const banner = Object.assign(document.createElement('div'), { dir: 'rtl' });
  banner.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147483646;padding:6px 12px;border-radius:999px;background:#12233af2;border:1px solid #25d366;color:#e2e8f0;font:13px Tahoma,Arial;pointer-events:none';
  const say = text => { banner.textContent = 'واتساب المرصد — ' + text; if (!banner.isConnected) document.documentElement.append(banner); };
  say('بيبدأ…');

  const loggedIn = () => !!document.querySelector('#pane-side, [data-testid="chat-list"], div[aria-label="Chat list"], div[aria-label="قائمة الدردشات"]');
  const invalidNumber = () => [...document.querySelectorAll('[role="dialog"]')].some(d => /(shared via url is invalid|غير صالح|isn.t on WhatsApp|ليس على واتساب|not on WhatsApp)/i.test(d.innerText || ''));
  const composer = () => document.querySelector('footer div[contenteditable="true"], div[contenteditable="true"][data-tab="10"]');
  const sendButton = () => {
    const icon = document.querySelector('footer [data-icon="send"], footer [data-icon="wds-ic-send-filled"], [data-icon="send"], [data-icon="wds-ic-send-filled"]');
    return icon?.closest('button,[role="button"]') || document.querySelector('footer button[aria-label="Send"], footer button[aria-label="إرسال"], button[aria-label="Send"], button[aria-label="إرسال"]');
  };
  const report = async (j, ok, error, invalid) => {
    const saved = { ...j, phase: 'result', result: { ok, error, invalid: !!invalid } };
    job.set(saved);
    const reply = await bg({ type: 'TALABAT_WA_RESULT', id: j.id, kind: j.kind, claimToken: j.claimToken, ...saved.result }).catch(() => null);
    if (reply?.ok) { job.set(null); return true; }
    say('نتيجة الإرسال محفوظة؛ مستني تأكيد المرصد'); return false;
  };
  const normalized = text => String(text || '').replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\ufe0f/g, '').normalize('NFC').replace(/\s+/g, ' ').trim();

  // WhatsApp renders emoji as images and can split one message over several text spans.
  // Read only outgoing message text; chat history, timestamps and status labels are excluded.
  const outgoingText = node => {
    const parts = [...node.querySelectorAll('.selectable-text')].filter(n => !n.parentElement?.closest('.selectable-text'));
    const read = n => {
      if (n.nodeType === 3) return n.textContent;
      if (n.nodeType !== 1) return '';
      if (n.tagName === 'IMG') return n.getAttribute('alt') || '';
      if (n.tagName === 'BR') return ' ';
      const value = [...n.childNodes].map(read).join('');
      return /^(DIV|P)$/.test(n.tagName) ? value + ' ' : value;
    };
    return normalized(parts.map(read).join(' '));
  };
  const outgoing = () => [...document.querySelectorAll('.message-out')];
  const messageId = n => n.getAttribute('data-id') || n.closest('[data-id]')?.getAttribute('data-id') || null;
  const snapshot = text => ({ captured: true, ids: outgoing().map(messageId).filter(Boolean),
    count: outgoing().filter(n => outgoingText(n) === normalized(text)).length });
  const sentSince = (j, baseline) => {
    if (!baseline?.captured || (composer()?.innerText || '').trim()) return false;
    const matches = outgoing().filter(n => outgoingText(n) === normalized(j.text));
    return matches.some(n => messageId(n) && !baseline.ids.includes(messageId(n))) || matches.length > baseline.count;
  };
  async function observe(j) {
    for (let k = 0; k < 60; k++) {
      await sleep(1000);
      if (sentSince(j, j.baseline)) { if (await report(j, true)) say('اتأكد الإرسال ✓'); return; }
    }
    await report(j, false, 'delivery_unconfirmed'); say('الإرسال غير مؤكد؛ راجع الرسالة من الإدارة');
  }

  // A message in progress: this page is its send link. Wait for the chat to open with the text, press send, check.
  async function finish(j) {
    if (j.phase === 'result') { await report(j, j.result.ok, j.result.error, j.result.invalid); return; }
    if (j.phase === 'clicked') { await observe(j); return; }
    say('بيبعت ' + (j.kind === 'survey' ? 'الاستطلاع' : 'الترحيب') + '…');
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      if (invalidNumber()) { await report(j, false, 'الرقم مش على واتساب', true); say('الرقم مش على واتساب — اتسجل'); return; }
      const box = composer(), btn = sendButton();
      if (box && normalized(box.innerText) === normalized(j.text) && normalized(j.text) && btn) {
        await sleep(800 + Math.random() * 1500);   // a person's pace
        if (composer() !== box || normalized(box.innerText) !== normalized(j.text)) continue;
        const sending = { ...j, phase: 'clicked', baseline: snapshot(j.text) };
        job.set(sending);
        btn.click();
        await observe(sending);
        return;
      }
    }
    await report(j, false, loggedIn() ? 'المحادثة أو نص الرسالة غير جاهز' : 'واتساب ويب مش متسجل دخول'); say('الإرسال متوقف للمراجعة');
  }

  const pending = job.get();
  if (pending) {
    if (pending.phase === 'result' || pending.phase === 'clicked' || Date.now() - pending.at < 5 * 60000) await finish(pending);
    else { await report(pending, false, 'الصفحة اتقفلت قبل الإرسال'); }
  }
  // Then: ask for the next message every 15 seconds, only while WhatsApp Web is signed in.
  for (;;) {
    await sleep(15000);
    try {
      const saved = job.get();
      if (saved) { await finish(saved); continue; }
      if (!loggedIn()) { say('امسح الكود اللي على الشاشة من موبايل المطعم (الأجهزة المرتبطة ← ربط جهاز)'); continue; }
      const r = await bg({ type: 'TALABAT_WA_NEXT' }).catch(() => null);
      if (!r?.ok) { say('مش قادر يكلم المرصد'); continue; }
      if (!r.on) { say('الإرسال واقف من صفحة الإدارة'); continue; }
      if (!r.message) { say('مستني رسايل · ' + new Date().toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })); continue; }
      const m = r.message;
      job.set({ ...m, at: Date.now() });
      location.href = 'https://web.whatsapp.com/send?phone=' + encodeURIComponent(m.phone) + '&text=' + encodeURIComponent(m.text);
      return;
    } catch (e) { say('خطأ: ' + e.message); }
  }
})();
