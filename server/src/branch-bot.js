// بوت الفروع (Karim 11-11): the branches ask and report in their own Telegram groups; the bot answers by itself from
// the Marsad's data. What needs the customer goes to the call center as a call to make (the call center only makes
// calls); what touches money or cancels an order waits for a supervisor's approval in the Marsad. Everything the bot
// said and did is kept for review.
//
// The bot reads its updates on the Telegram tick (getUpdates, no webhook). With Telegram's group privacy on (the
// default), a group sends the bot only commands, replies to the bot's own messages and its buttons — the group's own
// talk never reaches the server.
import { businessDay, iso } from './time.js';

const KINDS = {
  status: { label: '📦 حالة أوردر', ask: 'اكتب رقم الأوردر (رقم طلبات أو الموقع أو Apex):', needs: 'none' },
  item_out: { label: '🚫 صنف خلصان', ask: 'اكتب رقم الأوردر والصنف اللي خلصان (ولو فيه بديل اكتبه):', needs: 'call', title: 'صنف خلصان' },
  change: { label: '🔁 العميل عايز يغيّر أو يلغي', ask: 'اكتب رقم الأوردر والعميل عايز إيه بالظبط:', needs: 'call', title: 'العميل عايز يغيّر أو يلغي' },
  unclear: { label: '📝 ملاحظة أو عنوان مش واضح', ask: 'اكتب رقم الأوردر:', needs: 'none' },
  call: { label: '📞 محتاجين حد يكلم العميل', ask: 'اكتب رقم الأوردر وعايزين نقول للعميل إيه:', needs: 'call', title: 'مكالمة للعميل' },
  other: { label: '❓ حاجة تانية', ask: 'اكتب المشكلة (ورقم الأوردر لو فيه):', needs: 'review', title: 'رسالة من الفرع' },
};
// What the call center can answer after the call, per kind.
const OUTCOMES = {
  done: 'اتحلت مع العميل', substitute: 'العميل وافق على بديل', drop_item: 'العميل لغى الصنف ده بس',
  cancel: 'العميل عايز يلغي الأوردر', no_answer: 'العميل مابيردش',
};
const MENU_TEXT = '🤖 بوت مرصد الدهان — اختار:';
const clock = ms => new Date(ms).toLocaleTimeString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
const money = v => v == null ? '—' : (Math.round(Number(v) * 100) / 100).toLocaleString('en-US') + ' ج';
const digitsOf = t => (String(t || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).match(/\d{2,12}/) || [])[0] || null;
const CALL_OVERDUE_MS = 10 * 60000, REVIEW_OVERDUE_MS = 15 * 60000;

function setup(app) {
  const { db, fail } = app;
  const setting = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;
  const put = (k, v) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));
  const json = (v, d) => { try { return JSON.parse(v) ?? d; } catch { return d; } };
  const enabledBranches = async () => new Set(json(await setting('bot_branches'), []));

  // ---------- reading the groups ----------
  async function poll(c, now) {
    const on = await enabledBranches();
    if (!on.size) return;
    const offset = Number(await setting('bot_update_offset')) || 0;
    const updates = await app.telegramCall('getUpdates', { offset, timeout: 0, limit: 50, allowed_updates: ['message', 'callback_query', 'my_chat_member'] }, c.token);
    if (!updates?.length) return;
    // Confirm first: an update that throws is never read twice (it is logged as an error instead).
    await put('bot_update_offset', updates[updates.length - 1].update_id + 1);
    const groups = await app.telegramBranchGroups(), byChat = new Map(Object.entries(groups).map(([name, g]) => [String(g.id), name]));
    const seen = json(await setting('bot_seen_chats'), {});
    for (const u of updates) {
      const chat = u.message?.chat || u.callback_query?.message?.chat || u.my_chat_member?.chat;
      if (chat && chat.type !== 'private') seen[String(chat.id)] = { id: String(chat.id), title: chat.title || String(chat.id), type: chat.type };
      const branch = chat && byChat.get(String(chat.id));
      if (!branch || !on.has(branch)) continue;
      try {
        if (u.callback_query) await onButton(c, branch, u.callback_query, now);
        else if (u.message?.text) await onMessage(c, branch, u.message, now);
      } catch (e) {
        await db.prepare('INSERT INTO bot_log (day, at, branch, kind, asked, answer) VALUES (?,?,?,?,?,?)').run(businessDay(now), now, branch, 'error', String(u.message?.text || u.callback_query?.data || '').slice(0, 300), String(e.message || e).slice(0, 300));
      }
    }
    await put('bot_seen_chats', JSON.stringify(seen));
  }
  const send = (c, chatId, text, extra = {}) => app.telegramCall('sendMessage', { chat_id: chatId, text, ...extra }, c.token);
  const replyTo = id => id ? { reply_parameters: { message_id: id, allow_sending_without_reply: true } } : {};
  const menuMarkup = () => ({ reply_markup: { inline_keyboard: Object.entries(KINDS).map(([k, v]) => [{ text: v.label, callback_data: 'bot:' + k }]) } });
  const who = m => [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ').slice(0, 60) || m.from?.username || 'الفرع';
  const log = (now, branch, kind, asked, answer, caseId = null) => db.prepare('INSERT INTO bot_log (day, at, branch, kind, asked, answer, case_id) VALUES (?,?,?,?,?,?,?)')
    .run(businessDay(now), now, branch, kind, String(asked || '').slice(0, 500), String(answer || '').slice(0, 2000), caseId);

  async function onButton(c, branch, q, now) {
    const chatId = String(q.message.chat.id), data = String(q.data || '');
    try { await app.telegramCall('answerCallbackQuery', { callback_query_id: q.id }, c.token); } catch {}
    if (data === 'bot:menu') { await send(c, chatId, MENU_TEXT, menuMarkup()); return; }
    const m = data.match(/^bot:(\w+)(?::(\d+))?$/); if (!m || !KINDS[m[1]]) return;
    const kind = m[1], ref = m[2] || null;
    // «محتاجين حد يكلم العميل» under an answer about an order: the call is made for that order at once.
    if (kind === 'call' && ref) { await openCase(c, branch, chatId, { kind: 'call', digits: ref, text: 'الفرع طلب مكالمة للعميل بخصوص الأوردر', from: who(q), msgId: q.message.message_id }, now); return; }
    const sent = await send(c, chatId, KINDS[kind].ask, { reply_markup: { force_reply: true, selective: false, input_field_placeholder: 'رقم الأوردر' } });
    await db.prepare('INSERT OR REPLACE INTO bot_prompts (chat_id, message_id, kind, at) VALUES (?,?,?,?)').run(chatId, sent.message_id, kind, now);
  }

  async function onMessage(c, branch, msg, now) {
    const chatId = String(msg.chat.id), text = String(msg.text || '').trim(), parentId = msg.reply_to_message?.message_id;
    if (/^\/(start|menu|help)\b/i.test(text)) { await send(c, chatId, MENU_TEXT, menuMarkup()); return; }
    // An answer to one of the bot's questions.
    const prompt = parentId ? await db.prepare('SELECT * FROM bot_prompts WHERE chat_id = ? AND message_id = ?').get(chatId, parentId) : null;
    if (prompt?.kind === 'reply' && prompt.case_id) { await caseNote(c, prompt.case_id, 'branch', who(msg), text, now); await send(c, chatId, '✅ وصل — اتضاف على الطلب.', replyTo(msg.message_id)); return; }
    const kind = prompt?.kind || (/^\/o(rder)?\b/i.test(text) || /^\s*#?\d{2,12}\s*$/.test(text) ? 'status' : null);
    if (kind === 'status' || kind === 'unclear') { await answerOrder(c, branch, chatId, msg, digitsOf(text), kind, now); return; }
    if (kind && KINDS[kind]) { await openCase(c, branch, chatId, { kind, digits: digitsOf(text), text, from: who(msg), msgId: msg.message_id }, now); return; }
    // A reply to any other message of the bot (an alert in the group): kept as a message from the branch for review.
    if (parentId) { await openCase(c, branch, chatId, { kind: 'other', digits: digitsOf(text) || digitsOf(msg.reply_to_message?.text), text: text + (msg.reply_to_message?.text ? '\n— ردًا على: ' + String(msg.reply_to_message.text).slice(0, 200) : ''), from: who(msg), msgId: msg.message_id }, now); return; }
    await send(c, chatId, MENU_TEXT, { ...menuMarkup(), ...replyTo(msg.message_id) });
  }

  // ---------- answers from the Marsad ----------
  function orderText(o) {
    const src = o.source === 'talabat' ? 'طلبات' : 'الموقع', lines = ['📦 أوردر ' + src + (o.code ? ' #' + o.code : '') + (o.branch ? ' — ' + o.branch : '')];
    const done = o.apex || o.job?.state === 'auto_done';
    lines.push('• على Apex: ' + (o.apex ? '✅ اتسجل' + (o.apex.sn ? ' (رقم ' + o.apex.sn + ')' : '') : o.job?.state === 'auto_done' ? '✅ اتسجل آلي' : /^auto_(pending|sending)$/.test(o.job?.state || '') ? '⏳ بيتسجل دلوقتي' : '❌ لسه ما اتسجلش'));
    const pay = o.payment === 'cash' ? 'كاش — يتحصّل ' + money(o.target ?? o.total) : o.payment === 'paid' ? 'مدفوع أونلاين — ما يتحصلش حاجة' : o.payment === 'mixed' ? 'جزء أونلاين والباقي كاش' : o.payment === 'unpaid' ? '⚠️ أونلاين ولسه ما اتدفعش' : 'مش واضح';
    lines.push('• الدفع: ' + pay);
    if (o.fulfillment === 'pickup') lines.push('• استلام من الفرع');
    if (o.items?.length) lines.push('• الأصناف: ' + o.items.slice(0, 15).map(i => i.qty + '× ' + i.name + (i.sizeOption ? ' (' + i.sizeOption + ')' : '')).join('، '));
    if (o.note) lines.push('• ملاحظة العميل: ' + o.note);
    if (o.at) lines.push('• وقت الأوردر: ' + clock(Date.parse(o.at)) + (o.out ? ' — خرج' : ''));
    void done;
    return lines.join('\n');
  }
  async function answerOrder(c, branch, chatId, msg, digits, kind, now) {
    const o = digits && app.transferLookup ? await app.transferLookup(digits, now) : null;
    let answer;
    if (!o) answer = digits ? 'مالقيتش أوردر رقم ' + digits + ' النهارده ولا امبارح. ابعت الرقم اللي على شاشة طلبات أو فاتورة الموقع.' : 'ابعت رقم الأوردر.';
    else if (kind === 'unclear') answer = orderText(o) + '\n\n📍 العنوان كامل: ' + (o.customer?.address || '—') + (o.note ? '\n📝 الملاحظة زي ما العميل كتبها: ' + o.note : '\n📝 مفيش ملاحظة من العميل.');
    else answer = orderText(o);
    const markup = o ? { reply_markup: { inline_keyboard: [[{ text: KINDS.call.label, callback_data: 'bot:call:' + digits }], [{ text: '☰ القايمة', callback_data: 'bot:menu' }]] } } : {};
    await send(c, chatId, answer, { ...markup, ...replyTo(msg.message_id) });
    await log(now, branch, kind, msg.text, answer);
  }

  // ---------- cases: a call to make, an approval, a message to review ----------
  async function openCase(c, branch, chatId, { kind, digits, text, from, msgId }, now) {
    const o = digits && app.transferLookup ? await app.transferLookup(digits, now) : null;
    if (KINDS[kind].needs === 'call' && !o) {
      const a = digits ? 'مالقيتش أوردر رقم ' + digits + ' — ابعت الرقم اللي على شاشة طلبات أو فاتورة الموقع.' : 'محتاج رقم الأوردر عشان نكلم العميل.';
      const sent = await send(c, chatId, a, { ...replyTo(msgId), reply_markup: { force_reply: true, selective: false } });
      await db.prepare('INSERT OR REPLACE INTO bot_prompts (chat_id, message_id, kind, at) VALUES (?,?,?,?)').run(chatId, sent.message_id, kind, now);
      await log(now, branch, kind, text, a); return null;
    }
    const needs = KINDS[kind].needs;
    const r = await db.prepare(`INSERT INTO bot_cases (day, branch, chat_id, kind, needs, state, source, ref, code, text, from_name, msg_id, created_at, updated_at) VALUES (?,?,?,?,?,'open',?,?,?,?,?,?,?,?)`)
      .run(businessDay(now), branch, chatId, kind, needs, o?.source || null, o ? String(o.ref) : null, o?.code || digits || null, String(text || '').slice(0, 1000), from, msgId, now, now);
    const id = Number(r.lastInsertRowid);
    const a = needs === 'call' ? '📞 تمام — الكول سنتر هيكلم العميل' + (o?.code ? ' (أوردر #' + o.code + ')' : '') + ' وهنرد عليكم هنا. رقم الطلب ' + id + '.'
      : '📨 وصلت للمشرفين وهيردوا هنا. رقم الطلب ' + id + '.';
    const sent = await send(c, chatId, a, replyTo(msgId));
    await db.prepare('INSERT OR REPLACE INTO bot_prompts (chat_id, message_id, kind, case_id, at) VALUES (?,?,?,?,?)').run(chatId, sent.message_id, 'reply', id, now);
    await log(now, branch, kind, text, a, id);
    if (needs === 'review') await notifySupervisors(id, '📨 رسالة من فرع ' + branch + (o?.code ? ' — أوردر #' + o.code : '') + ': ' + String(text || '').slice(0, 300), now);
    return id;
  }
  // Supervisors hear at once that something waits for them in the Marsad (their group on Telegram).
  const notifySupervisors = (id, text, now) => db.prepare('INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at) VALUES (?,?,?,?,?)')
    .run('bot:new:' + id, 'botNew', null, text + '\n↩️ من المرصد: المتابعة ← بوت الفروع (طلب ' + id + ')', now);
  async function caseNote(c, id, side, by, text, now) {
    const k = await db.prepare('SELECT * FROM bot_cases WHERE id = ?').get(id); if (!k) return;
    const note = '\n— ' + (side === 'branch' ? 'الفرع' : by) + ' ' + clock(now) + ': ' + String(text).slice(0, 500);
    await db.prepare('UPDATE bot_cases SET text = substr(text || \'\', 1, 3000) || ?, updated_at = ? WHERE id = ?').run(note, now, id);
  }
  async function tellBranch(id, text) {
    const c = await app.telegramConfig(), k = await db.prepare('SELECT * FROM bot_cases WHERE id = ?').get(id);
    if (!c.token || !k?.chat_id) return;
    const sent = await send(c, k.chat_id, text, replyTo(k.msg_id));
    await db.prepare('INSERT OR REPLACE INTO bot_prompts (chat_id, message_id, kind, case_id, at) VALUES (?,?,?,?,?)').run(k.chat_id, sent.message_id, 'reply', id, app.now());
  }

  // Overdue: a call nobody made in 10 minutes, a message no supervisor answered in 15 → the supervisors' group.
  async function escalate(now) {
    const rows = await db.prepare("SELECT * FROM bot_cases WHERE state IN ('open','claimed') AND escalated_at IS NULL AND ((needs = 'call' AND created_at < ?) OR (needs IN ('review','approval') AND created_at < ?))").all(now - CALL_OVERDUE_MS, now - REVIEW_OVERDUE_MS);
    for (const k of rows) {
      const what = k.needs === 'call' ? 'مكالمة للعميل ما اتعملتش' : k.needs === 'approval' ? 'موافقة على إلغاء مستنية' : 'رسالة من فرع ما اتردش عليها';
      await db.prepare('INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at) VALUES (?,?,?,?,?)')
        .run('bot:late:' + k.id, 'botLate', null, '⏰ بوت الفروع: ' + what + ' من ' + Math.round((now - k.created_at) / 60000) + ' دقيقة — ' + (k.branch || '') + (k.code ? ' — أوردر #' + k.code : '') + ' (طلب ' + k.id + ')', now);
      await db.prepare('UPDATE bot_cases SET escalated_at = ? WHERE id = ?').run(now, k.id);
    }
  }

  // ---------- the Marsad side ----------
  const caseOut = k => ({ id: k.id, day: k.day, branch: k.branch, kind: k.kind, kindLabel: KINDS[k.kind]?.title || KINDS[k.kind]?.label || k.kind, needs: k.needs, state: k.state,
    source: k.source, ref: k.ref, code: k.code, text: k.text, from: k.from_name, createdAt: iso(k.created_at), claimedBy: k.claimed_by, claimedAt: iso(k.claimed_at),
    outcome: k.outcome, outcomeLabel: OUTCOMES[k.outcome] || k.outcome || null, outcomeNote: k.outcome_note, doneBy: k.done_by, doneAt: iso(k.done_at), parentId: k.parent_id });
  async function withOrder(k, now) {
    const out = caseOut(k);
    if (k.code && app.transferLookup) { const o = await app.transferLookup(k.code, now); if (o) out.order = { code: o.code, source: o.source, customer: o.customer, payment: o.payment, target: o.target ?? o.total, items: (o.items || []).map(i => ({ qty: i.qty, name: i.name, size: i.sizeOption || null })), note: o.note || null }; }
    return out;
  }

  // The call center (transfer page): the calls to make.
  app.route('GET', '/api/bot/calls', async ctx => {
    await app.transferWho(ctx);
    const rows = await db.prepare("SELECT * FROM bot_cases WHERE needs = 'call' AND state IN ('open','claimed') ORDER BY id LIMIT 50").all();
    return { calls: await Promise.all(rows.map(k => withOrder(k, ctx.now))), outcomes: OUTCOMES };
  });
  app.route('POST', '/api/bot/calls', async ctx => {
    const me = await app.transferWho(ctx), b = ctx.body, id = Number(b.id);
    const k = await db.prepare("SELECT * FROM bot_cases WHERE id = ? AND needs = 'call'").get(id);
    if (!k) fail(404, 'الطلب مش موجود');
    if (k.state === 'done') fail(409, 'الطلب ده اتقفل');
    if (b.action === 'claim') {
      const r = await db.prepare("UPDATE bot_cases SET state = 'claimed', claimed_by = ?, claimed_at = ?, updated_at = ? WHERE id = ? AND (state = 'open' OR claimed_by = ?)").run(me.name, ctx.now, ctx.now, id, me.name);
      if (!r.changes) fail(409, 'مع ' + (k.claimed_by || 'حد تاني'));
      return { ok: true };
    }
    if (b.action === 'outcome') {
      const outcome = String(b.outcome || ''), note = String(b.note || '').trim().slice(0, 400);
      if (!OUTCOMES[outcome]) fail(400, 'اختار نتيجة المكالمة');
      if (['done', 'substitute', 'drop_item'].includes(outcome) && !note) fail(400, 'اكتب العميل قال إيه');
      if (k.claimed_by && k.claimed_by !== me.name && k.state === 'claimed') fail(409, 'مع ' + k.claimed_by);
      if (outcome === 'no_answer') {
        // The case stays open for another try; the branch knows.
        await db.prepare("UPDATE bot_cases SET state = 'open', claimed_by = NULL, claimed_at = NULL, outcome = 'no_answer', outcome_note = ?, updated_at = ? WHERE id = ?").run(note || null, ctx.now, id);
        await tellBranch(id, '📞 الكول سنتر اتصل بالعميل ومابيردش' + (note ? ' — ' + note : '') + '. هنحاول تاني.');
        await app.audit('bot_call', null, { actor: me.name, id, outcome });
        return { ok: true };
      }
      await db.prepare("UPDATE bot_cases SET state = 'done', outcome = ?, outcome_note = ?, done_by = ?, done_at = ?, updated_at = ? WHERE id = ?").run(outcome, note || null, me.name, ctx.now, ctx.now, id);
      if (outcome === 'cancel') {
        // Cancelling an order touches money and the restaurant's rating: a supervisor approves first.
        await db.prepare(`INSERT INTO bot_cases (day, branch, chat_id, kind, needs, state, source, ref, code, text, from_name, msg_id, created_at, updated_at, parent_id) VALUES (?,?,?,?,'approval','open',?,?,?,?,?,?,?,?,?)`)
          .run(businessDay(ctx.now), k.branch, k.chat_id, 'cancel', k.source, k.ref, k.code, 'العميل عايز يلغي الأوردر' + (note ? ' — ' + note : '') + ' (مكالمة ' + me.name + ')', me.name, k.msg_id, ctx.now, ctx.now, id);
        const ap = await db.prepare("SELECT id FROM bot_cases WHERE parent_id = ? AND needs = 'approval'").get(id);
        await notifySupervisors(ap.id, '🟥 موافقة مطلوبة: إلغاء أوردر' + (k.code ? ' #' + k.code : '') + ' — فرع ' + (k.branch || '') + (note ? ' — ' + note : ''), ctx.now);
        await tellBranch(id, '📞 العميل عايز يلغي الأوردر' + (k.code ? ' #' + k.code : '') + (note ? ' — ' + note : '') + '. مستنيين موافقة المشرف — ماتجهزوش لحد ما نرد.');
      } else await tellBranch(id, '📞 الكول سنتر كلم العميل: ' + OUTCOMES[outcome] + (note ? ' — ' + note : ''));
      await app.audit('bot_call', null, { actor: me.name, id, outcome, note });
      return { ok: true };
    }
    fail(400, 'invalid_action');
  });

  // Supervisors (admin page): approvals, messages to answer, and the day's review.
  app.route('GET', '/api/bot', async ctx => {
    await app.requireAdmin(ctx, 'read');
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(ctx.query.day || '')) ? ctx.query.day : businessDay(ctx.now);
    const open = await db.prepare("SELECT * FROM bot_cases WHERE needs IN ('approval','review') AND state IN ('open','claimed') ORDER BY id").all();
    const cases = await db.prepare('SELECT * FROM bot_cases WHERE day = ? ORDER BY id DESC LIMIT 300').all(day);
    const answers = await db.prepare('SELECT * FROM bot_log WHERE day = ? ORDER BY id DESC LIMIT 300').all(day);
    const groups = await app.telegramBranchGroups?.() || {}, on = await enabledBranches();
    return { day, open: await Promise.all(open.map(k => withOrder(k, ctx.now))), cases: cases.map(caseOut),
      answers: answers.map(a => ({ at: iso(a.at), branch: a.branch, kind: a.kind, kindLabel: KINDS[a.kind]?.label || a.kind, asked: a.asked, answer: a.answer, caseId: a.case_id })),
      branches: Object.keys(groups).map(name => ({ name, on: on.has(name) })) };
  });
  app.route('POST', '/api/bot', async ctx => {
    const who = await app.requireAdmin(ctx, 'write'), b = ctx.body;
    if (b.action === 'branches') {
      const groups = await app.telegramBranchGroups?.() || {};
      const list = (Array.isArray(b.branches) ? b.branches : []).map(String).filter(n => groups[n]);
      await put('bot_branches', JSON.stringify(list));
      // Start reading from now on: what was written before the bot was on is not answered.
      if (list.length && !(await setting('bot_update_offset'))) {
        const c = await app.telegramConfig();
        try { const u = await app.telegramCall('getUpdates', { offset: -1, timeout: 0, limit: 1 }, c.token); if (u?.length) await put('bot_update_offset', u[u.length - 1].update_id + 1); } catch {}
      }
      await app.audit('bot_branches', null, { actor: who.name, branches: list });
      return { ok: true };
    }
    if (b.action === 'menu') {
      // Post the menu in a branch group (pinned by the branch if they want it at hand).
      const groups = await app.telegramBranchGroups?.() || {}, g = groups[String(b.branch || '')];
      if (!g) fail(400, 'اختار الفرع');
      const c = await app.telegramConfig();
      await send(c, g.id, MENU_TEXT + '\n(ابعتوا /menu في أي وقت عشان القايمة تظهر)', menuMarkup());
      return { ok: true };
    }
    const id = Number(b.id), k = await db.prepare("SELECT * FROM bot_cases WHERE id = ? AND needs IN ('approval','review')").get(id);
    if (!k) fail(404, 'الطلب مش موجود');
    if (k.state === 'done') fail(409, 'الطلب ده اتقفل');
    const note = String(b.note || '').trim().slice(0, 500);
    if (b.action === 'approve' || b.action === 'reject') {
      if (k.needs !== 'approval') fail(400, 'invalid_action');
      if (b.action === 'reject' && !note) fail(400, 'اكتب السبب');
      await db.prepare("UPDATE bot_cases SET state = 'done', outcome = ?, outcome_note = ?, done_by = ?, done_at = ?, updated_at = ? WHERE id = ?").run(b.action === 'approve' ? 'approved' : 'rejected', note || null, who.name, ctx.now, ctx.now, id);
      await tellBranch(id, b.action === 'approve' ? '✅ ' + who.name + ' وافق على إلغاء الأوردر' + (k.code ? ' #' + k.code : '') + ' — وقّفوا تجهيزه.' + (note ? ' ' + note : '') : '↩️ ' + who.name + ' رفض الإلغاء' + (k.code ? ' للأوردر #' + k.code : '') + ': ' + note + ' — كمّلوا الأوردر.');
      await app.audit('bot_approval', null, { actor: who.name, id, decision: b.action, note });
      return { ok: true };
    }
    if (b.action === 'reply' || b.action === 'close') {
      if (b.action === 'reply' && !note) fail(400, 'اكتب الرد');
      if (note) { await caseNote(null, id, 'admin', who.name, note, ctx.now); await tellBranch(id, '💬 ' + who.name + ': ' + note); }
      if (b.action === 'close' || b.close) await db.prepare("UPDATE bot_cases SET state = 'done', done_by = ?, done_at = ?, updated_at = ? WHERE id = ?").run(who.name, ctx.now, ctx.now, id);
      await app.audit('bot_reply', null, { actor: who.name, id, note, closed: b.action === 'close' || !!b.close });
      return { ok: true };
    }
    fail(400, 'invalid_action');
  });

  app.branchBot = {
    poll: async (c, now) => { await poll(c, now); await escalate(now); },
    seenChats: async () => Object.values(json(await setting('bot_seen_chats'), {})),
  };
}

export { setup, KINDS, OUTCOMES };
