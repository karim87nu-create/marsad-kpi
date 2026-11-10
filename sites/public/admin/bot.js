'use strict';
// مرصد الدهان — بوت الفروع (Karim 11-11): what the supervisors approve or answer, the branches the bot is on for, and
// everything the bot said and did that day, for review.
window.MarsadBot = function MarsadBot(ctx) {
  const { api, h, $, table, pill, state, canWrite, showError } = ctx;
  const t = v => v ? new Date(v).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }) : '—';
  const money = v => v == null ? '' : Number(v).toLocaleString('ar-EG-u-nu-latn', { maximumFractionDigits: 2 }) + ' ج';
  let last = null;

  async function act(body, done) {
    try { await api('/api/bot', { method: 'POST', body }); if (done) done(); await render(); }
    catch (x) { showError(x); }
  }
  function openCard(k) {
    const o = k.order || {}, cu = o.customer || {}, note = h('input', { placeholder: k.needs === 'approval' ? 'ملاحظة (لازم مع الرفض)' : 'الرد اللي هيوصل للفرع', maxLength: 500, style: 'flex:1 1 260px' });
    const buttons = k.needs === 'approval'
      ? [h('button', { type: 'button', textContent: '✅ موافق على الإلغاء', onclick: () => act({ id: k.id, action: 'approve', note: note.value }) }),
         h('button', { type: 'button', className: 'ghost', textContent: '↩️ رفض', onclick: () => act({ id: k.id, action: 'reject', note: note.value }) })]
      : [h('button', { type: 'button', textContent: 'ابعت الرد', onclick: () => act({ id: k.id, action: 'reply', note: note.value }) }),
         h('button', { type: 'button', className: 'ghost', textContent: 'ابعت واقفل', onclick: () => act({ id: k.id, action: 'reply', note: note.value, close: true }) }),
         h('button', { type: 'button', className: 'ghost', textContent: 'اقفل من غير رد', onclick: () => act({ id: k.id, action: 'close' }) })];
    if (!canWrite()) buttons.length = 0;
    return h('article', { className: 'panel' },
      h('div', { className: 'inline' }, pill(k.needs === 'approval' ? 'موافقة على إلغاء' : 'رسالة من الفرع', k.needs === 'approval' ? 'bad' : 'warn'), h('b', { textContent: k.branch || '' }),
        k.code ? h('b', { textContent: ' #' + k.code }) : null, h('span', { className: 'muted', textContent: ' ' + t(k.createdAt) + (k.from ? ' — ' + k.from : '') })),
      h('p', { style: 'white-space:pre-wrap;margin:8px 0', textContent: k.text || '' }),
      o.code ? h('p', { className: 'muted', textContent: (cu.name ? cu.name + ' — ' : '') + (o.payment === 'cash' ? 'كاش ' + money(o.target) : o.payment === 'paid' ? 'مدفوع' : (o.payment || '')) + (o.items?.length ? ' — ' + o.items.map(i => i.qty + '× ' + i.name + (i.size ? ' (' + i.size + ')' : '')).join('، ') : '') }) : null,
      h('div', { className: 'inline' }, note, ...buttons));
  }

  async function render() {
    try {
      const d = last = await api('/api/bot?day=' + encodeURIComponent(state.day));
      const box = $('botOpen'); box.replaceChildren(...(d.open.length ? d.open.map(openCard) : [h('p', { className: 'muted', textContent: 'مفيش حاجة مستنية موافقة أو رد.' })]));
      const br = $('botBranches');
      br.replaceChildren(...(d.branches.length ? d.branches.map(b => h('label', { className: 'inline', style: 'gap:6px' }, (() => { const x = h('input', { type: 'checkbox', checked: b.on, disabled: !canWrite() }); x.dataset.botBranch = b.name; return x; })(), h('span', { textContent: b.name }),
        h('button', { type: 'button', className: 'ghost', textContent: 'ابعت القايمة للجروب', disabled: !canWrite() || !b.on, onclick: () => act({ action: 'menu', branch: b.name }) })))
        : [h('p', { className: 'muted', textContent: 'اربط جروبات الفروع الأول من الإعدادات ← تليجرام.' })]));
      table('botCases', [
        { title: 'الوقت', get: r => r.createdAt, show: r => t(r.createdAt) },
        { title: 'الفرع', get: r => r.branch },
        { title: 'النوع', get: r => r.kindLabel },
        { title: 'الأوردر', get: r => r.code || '' },
        { title: 'المطلوب', get: r => r.needs, show: r => ({ call: 'مكالمة', approval: 'موافقة', review: 'رد مشرف' }[r.needs] || r.needs) },
        { title: 'الحالة', get: r => r.state, show: r => r.state === 'done' ? 'اتقفلت' : r.state === 'claimed' ? 'مع ' + (r.claimedBy || '') : 'مفتوحة' },
        { title: 'النتيجة', get: r => (r.outcomeLabel || r.outcome || '') + (r.outcomeNote ? ' — ' + r.outcomeNote : '') },
        { title: 'مين', get: r => r.doneBy || r.claimedBy || '' },
        { title: 'التفاصيل', get: r => r.text || '' },
      ], d.cases, { empty: 'مفيش طلبات من الفروع في اليوم ده' });
      table('botAnswers', [
        { title: 'الوقت', get: r => r.at, show: r => t(r.at) },
        { title: 'الفرع', get: r => r.branch },
        { title: 'النوع', get: r => r.kindLabel },
        { title: 'الفرع كتب', get: r => r.asked || '' },
        { title: 'البوت رد', get: r => r.answer || '' },
      ], d.answers, { empty: 'البوت مارد على حاجة في اليوم ده' });
    } catch (x) { showError(x); }
  }
  $('botBranches').addEventListener('change', e => {
    if (!e.target.dataset.botBranch || !last) return;
    const on = [...document.querySelectorAll('[data-bot-branch]')].filter(x => x.checked).map(x => x.dataset.botBranch);
    act({ action: 'branches', branches: on });
  });
  return { render };
};
