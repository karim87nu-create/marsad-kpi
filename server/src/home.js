// الرئيسية (Karim 11-14 «عايزين نغير الاداره بتقاريرها بكل حاجه تناسب الي وصلنالو» — «لوحة واحدة لكل حاجة لايف»):
// the branches' board, the transfers and what needs a person, in one small answer for the home page (every 5 s) and for
// the manager's Telegram group. The calls come from /api/live, as on the call-center screen.
import { businessDay, iso, isOperating, cairoParts, addDays } from './time.js';
import { dailyReport, dailyText, headline, judge } from './daily.js';
import { parseJson } from './order-match.js';

const minsSince = (t, now) => Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 60000)) : null;

function setup(app) {
  const { db } = app;
  const setting = async k => (await db.prepare('SELECT value FROM settings WHERE key = ?').get(k))?.value ?? null;

  // The board's day (the monitor's latest push), read at most every 10 s: it is a large JSON.
  let board = null, boardAt = 0, boardKey = '';
  async function boardNow(now) {
    if (board && now - boardAt < 10000) return board;
    const row = await db.prepare('SELECT day, received_at FROM orders_days ORDER BY received_at DESC LIMIT 1').get();
    const key = row ? row.day + '|' + row.received_at : '';
    if (key !== boardKey) {
      const full = row ? parseJson((await db.prepare('SELECT data FROM orders_days WHERE day = ?').get(row.day))?.data, null) : null;
      const t = full?.totals || {};
      board = { day: row?.day || null, receivedAt: row?.received_at || null,
        totals: { orders: t.orders ?? null, sales: t.sales ?? null, open: t.open ?? null, late: t.late ?? null, avgOut: t.avgOut ?? null, outCount: t.outCount ?? null, outLate: t.outLate ?? null,
          cancels: t.cancels ?? null, cancelSales: t.cancelSales ?? null, discounts: t.discounts ?? null, issues: t.issues ?? null, kinds: t.kinds || null },
        settings: full?.settings || { late: 30, veryLate: 45 },
        branches: (full?.branches || []).map(b => ({ no: b.no, name: b.name, orders: b.orders, sales: b.sales, open: b.open, late: b.late, veryLate: b.veryLate, avgOut: b.avgOut, outCount: b.outCount, outLate: b.outLate, cancels: b.cancels })) };
      boardKey = key;
    }
    boardAt = now;
    return board;
  }

  // What needs a person now, most urgent first. Each item has a stable key (for Telegram: told once).
  app.homeAttention = async (now, t, b) => {
    const out = [], add = (key, level, text, view) => out.push({ key, level, text, view });
    const open = isOperating(now);
    for (const x of t.list) {
      const tag = (x.source === 'talabat' ? 'طلبات #' : 'الموقع #') + (x.code || x.ref) + (x.branch ? ' — ' + x.branch : '');
      if (x.state === 'failed') add('tfail:' + x.source + ':' + x.ref, 'bad', 'ماتسجلش على Apex: ' + tag + (x.why ? ' (' + x.why + ')' : ''), 'transferLive');
      const m = minsSince(Date.parse(x.at), now);
      if ((x.state === 'waiting' || x.state === 'claimed') && m != null && m >= 5 && m < 240)
        add('twait:' + x.source + ':' + x.ref, m >= 10 ? 'bad' : 'warn', tag + ' مستني التسجيل على Apex من ' + m + ' دقيقة' + (x.state === 'claimed' ? ' (مع ' + x.by + ')' : '') + (x.why ? ' — ' + x.why : ''), 'transferLive');
    }
    // Karim 11-14 (11-12 ليلاً: the PC restarted and the writer could not log in to Apex for 2 hours while it kept talking
    // to the server, so it looked alive): orders handed to the writer and still not written after 4 minutes = the writer is stuck.
    const stuck = t.list.filter(x => x.state === 'writing' && minsSince(Date.parse(x.since), now) >= 4);
    if (stuck.length) {
      const m = Math.max(...stuck.map(x => minsSince(Date.parse(x.since), now)));
      add('part:writerStuck', 'bad', 'كاتب Apex مش بيسجل: ' + stuck.length + ' أوردر مستنيه من ' + m + ' دقيقة — غالباً مش قادر يدخل على Apex (اتعمل ريستارت للجهاز؟)، سجّلوهم بإيد', 'transferLive');
    }
    for (const br of b?.branches || []) if (br.veryLate > 0 || br.late > 0)
      add('late:' + br.no + ':' + (br.veryLate > 0 ? 'v' : 'l'), br.veryLate > 0 ? 'bad' : 'warn', 'فرع ' + br.name + ': ' + br.late + ' أوردر متأخر' + (br.veryLate ? ' (منهم ' + br.veryLate + ' متأخر جداً)' : ''), 'branchesNow');
    const day = businessDay(now);
    for (const c of await db.prepare("SELECT order_no, sn, branch, state, result FROM apex_cancels WHERE day = ? AND state IN ('manual', 'failed', 'withPilot')").all(day).catch(() => []))
      add('cancel:' + c.order_no + ':' + c.state, 'warn', 'أوردر ' + (c.sn || c.order_no) + (c.branch ? ' — ' + c.branch : '') + ' مكتوب إنه ملغي ' + (c.state === 'withPilot' ? 'وخرج مع الطيار' : c.state === 'failed' ? 'والمرصد ماقدرش يلغيه' + (c.result ? ': ' + c.result : '') : 'ولسه على Apex'), 'auto');
    if (open) {
      const w = minsSince(Date.parse(t.parts.writerSeen), now), a = minsSince(Date.parse(t.parts.apexPush), now);
      if (w == null || w >= 5) add('part:writer', 'bad', 'كاتب Apex مش شغال' + (w != null ? ' من ' + w + ' دقيقة' : ''), 'system');
      if (a == null || a >= 5) add('part:apex', 'bad', 'المرصد مش بيقرا من Apex' + (a != null ? ' من ' + a + ' دقيقة' : ''), 'system');
      if (!t.parts.talabatScreen) add('part:talabat', 'warn', 'شاشة لايف طلبات مش مفتوحة — أوردرات طلبات مش بتوصل', 'transferLive');
    }
    const rank = { bad: 0, warn: 1 };
    return out.sort((x, y) => rank[x.level] - rank[y.level]);
  };

  app.homeNow = async (now, waitUntil) => {
    const [t, b] = await Promise.all([app.transferLive(now, waitUntil), boardNow(now)]);
    const L = t.list, by = st => L.filter(x => x.state === st);
    const waiting = [...by('waiting'), ...by('claimed')], onApex = by('apex'), auto = onApex.filter(x => x.how === 'auto');
    const took = onApex.map(x => (Date.parse(x.enteredAt) - Date.parse(x.at)) / 60000).filter(v => Number.isFinite(v) && v >= 0 && v < 180);
    const oldest = waiting.reduce((m, x) => Math.max(m, minsSince(Date.parse(x.at), now) || 0), 0);
    const src = s => ({ all: L.filter(x => x.source === s).length, apex: onApex.filter(x => x.source === s).length, auto: auto.filter(x => x.source === s).length });
    return {
      serverNow: iso(now), autoMode: t.autoMode, writerMode: t.writerMode, parts: t.parts,
      transfers: { waiting: waiting.length, oldest, writing: by('writing').length, failed: by('failed').length, onApex: onApex.length, auto: auto.length,
        avg: took.length ? Math.round(took.reduce((x, y) => x + y, 0) / took.length * 10) / 10 : null, talabat: src('talabat'), site: src('site') },
      board: b ? { ...b, receivedAt: iso(b.receivedAt), ageSeconds: b.receivedAt ? Math.round((now - b.receivedAt) / 1000) : null } : null,
      // The orders not yet on Apex, oldest first (failed first of all): the queue in the middle of the room.
      waitingList: [...by('failed'), ...[...waiting, ...by('writing')].sort((x, y) => (Date.parse(x.at) || 0) - (Date.parse(y.at) || 0))].slice(0, 12)
        .map(x => ({ source: x.source, ref: x.ref, code: x.code, branch: x.branch, at: x.at, state: x.state, by: x.by || null, why: x.why ? String(x.why).slice(0, 160) : null })),
      attention: await app.homeAttention(now, t, b)
    };
  };

  app.route('GET', '/api/home', async ctx => {
    await app.requireAdmin(ctx);
    return app.homeNow(ctx.now, ctx.waitUntil);
  });
  app.homeSetting = setting;

  // جروب المتابعة (Karim 11-14): what needs him, once each, and the day's report after the day ends (2:15 ص).
  // Only things that stayed: an order waiting 10+ minutes, a failed write, a very late branch, a part down.
  const HOUR = 3600000;
  let lastRun = 0;
  const tell = async (key, kind, text, now) => db.prepare("INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, sent_at, target, branch) VALUES (?, ?, NULL, ?, ?, NULL, 'manager', NULL)").run(key, kind, text, now);
  app.managerTick = async (now, { force = false } = {}) => {
    if (!force && now - lastRun < 60000) return; lastRun = now;
    if (!await setting('telegram_manager_chat_id')) return;
    const rules = parseJson((await db.prepare('SELECT rules FROM telegram_config WHERE id = 1').get().catch(() => null))?.rules, {}) || {};
    const day = businessDay(now), p = cairoParts(new Date(now));
    if (rules.managerDaily !== false && (p.hour > 2 || p.hour === 2 && p.minute >= 15) && p.hour < 9) {
      const key = 'mgrDaily:' + day;
      if (!await db.prepare('SELECT 1 FROM telegram_log WHERE key = ?').get(key)) await tell(key, 'managerDaily', dailyText(await dailyReport(app, day, now)), now);
    }
    // Saturday's night: the week against the week before (the eight numbers, each a 7-day average).
    if (rules.managerWeekly !== false && new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() === 6 && (p.hour > 2 || p.hour === 2 && p.minute >= 20) && p.hour < 9) {
      const key = 'mgrWeekly:' + day;
      if (!await db.prepare('SELECT 1 FROM telegram_log WHERE key = ?').get(key)) await tell(key, 'managerWeekly', await weekText(day, now), now);
    }
    if (rules.managerAttention === false || !isOperating(now)) return;
    const h = await app.homeNow(now);
    const slot = Math.floor(now / HOUR);
    // Karim 11-14 «لي علي الجروب بتاعي مفيش ردود تغيير حاله»: what was told and is no longer so gets a reply under it.
    const open = new Set(h.attention.map(a => a.key));
    const told = await db.prepare("SELECT l.key, l.text, l.created_at FROM telegram_log l WHERE l.target = 'manager' AND l.kind = 'managerAttention' AND l.created_at >= ? AND NOT EXISTS (SELECT 1 FROM telegram_log r WHERE r.key = 'resolved:' || l.key)").all(now - 24 * HOUR);
    for (const r of told) {
      const base = r.key.slice(4).replace(/:[^:]+$/, '');
      if (open.has(base)) continue;
      const mins = Math.max(1, Math.round((now - r.created_at) / 60000)), what = r.text.replace(/^(?:🔴|🟠)\s*/u, '');
      const done = base.startsWith('tfail:') || base.startsWith('twait:') ? '✅ اتحلت' : base.startsWith('late:') ? '✅ الفرع خلص التأخير' : base.startsWith('cancel:') ? '✅ اتقفلت' : '✅ رجع يشتغل';
      await db.prepare("INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, reply_to, sent_at, target, branch) VALUES (?, 'managerAttention:resolved', NULL, ?, ?, ?, NULL, 'manager', NULL)")
        .run('resolved:' + r.key, done + ' بعد ' + mins + ' دقيقة\n' + what, now, r.key);
    }
    for (const a of h.attention) {
      if (a.key.startsWith('twait:') && !/من (?:1\d|[2-9]\d|\d{3,}) دقيقة/.test(a.text)) continue;   // 10 minutes and more only
      if (a.key.startsWith('late:') && !a.key.endsWith(':v')) continue;                                  // very late only
      const once = a.key.startsWith('late:') || a.key.startsWith('part:') ? a.key + ':' + slot : a.key + ':' + day;  // a state: once an hour; an order: once
      await tell('mgr:' + once, 'managerAttention', (a.level === 'bad' ? '🔴 ' : '🟠 ') + a.text, now);
    }
  };
  async function weekText(day, now) {
    const avg = async (to) => {
      const sums = {}, n = {};
      for (let i = 0; i < 7; i++) { const r = await dailyReport(app, addDays(to, -i), now); for (const x of r.headline) if (x.value != null) { sums[x.key] = (sums[x.key] || 0) + x.value; n[x.key] = (n[x.key] || 0) + 1; } }
      return Object.fromEntries(Object.keys(sums).map(k => [k, Math.round(sums[k] / n[k] * 10) / 10]));
    };
    const [a, b] = [await avg(day), await avg(addDays(day, -7))];
    const dot = { good: '🟢', warn: '🟡', bad: '🔴' }, lines = ['📈 الأسبوع لحد ' + day + ' مقارنة بالأسبوع اللي قبله (متوسط اليوم)', ''];
    for (const x of headline({})) { const v = a[x.key]; if (v == null) continue; const w = b[x.key];
      lines.push((dot[judge(x, v)] || '⚪') + ' ' + x.label + ': ' + v + (x.unit ? ' ' + x.unit : '') + (w != null ? ' (كان ' + w + ')' : '')); }
    return lines.join('\n');
  }

  // الصبح الساعة 10 (Karim 11-14, تصور المؤشرات): yesterday's numbers to whom they belong — each branch its own (and where it
  // stands among the branches), the call center its own, the online group the transfer to Apex. Once a day each.
  let lastMorning = 0;
  app.morningTick = async (now, { force = false } = {}) => {
    if (!force && now - lastMorning < 60000) return; lastMorning = now;
    const p = cairoParts(new Date(now)); if (p.hour < 10 || p.hour >= 13) return;
    const day = addDays(businessDay(now), -1);
    if (await setting('morning_done') === day) return;
    const rules = parseJson((await db.prepare('SELECT rules FROM telegram_config WHERE id = 1').get().catch(() => null))?.rules, {}) || {};
    const rep = await dailyReport(app, day, now), c = rep.cur, fmt = v => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 });
    const put = (key, kind, text, target, branch) => db.prepare('INSERT OR IGNORE INTO telegram_log (key, kind, employee_id, text, created_at, sent_at, target, branch) VALUES (?, ?, NULL, ?, ?, NULL, ?, ?)').run(key, kind, text, now, target, branch);
    const T = { late: 30 };
    if (rules.morningBranch !== false && c.branches.length) {
      const ranked = [...c.branches].filter(b => b.orders).sort((x, y) => (x.lateRate ?? 99) - (y.lateRate ?? 99) || (x.avgOut ?? 99) - (y.avgOut ?? 99));
      for (const b of ranked) {
        const pb = (rep.prev.branches || []).find(x => x.no === b.no) || {}, rank = ranked.indexOf(b) + 1;
        const text = ['📊 فرع ' + b.name + ' — يوم ' + day, '',
          '• أوردرات: ' + fmt(b.orders) + (pb.orders ? ' (الأسبوع اللي فات ' + fmt(pb.orders) + ')' : ''),
          '• متوسط وقت الخروج: ' + fmt(b.avgOut) + ' د (الهدف ' + T.late + ' د أو أقل)',
          '• خرجوا بعد 30 دقيقة: ' + fmt(b.lateRate) + '% (الهدف 10% أو أقل)',
          '• إلغاءات: ' + fmt(b.cancels), '',
          'ترتيبكم بين الفروع في الالتزام بالوقت: ' + rank + ' من ' + ranked.length].join('\n');
        await put('morning:branch:' + day + ':' + b.no, 'morningBranch', text, 'branches', b.name);
      }
    }
    if (rules.morningCalls !== false && c.calls) {
      const d = await app.heavy('day', day, now).catch(() => null);
      const top = (d?.employees || []).filter(e => (e.answered ?? e.calls) > 0).sort((x, y) => (y.answered ?? y.calls) - (x.answered ?? x.calls)).slice(0, 3);
      const text = ['☎️ الكول سنتر — يوم ' + day, '',
        '• مكالمات: ' + fmt(c.calls.calls) + ' · اترد عليها ' + fmt(c.calls.answered),
        '• الرد خلال 10 ثواني: ' + fmt(c.calls.sla) + '% (الهدف 90% أو أكتر)',
        '• الفائتة: ' + fmt(c.calls.abandonmentRate) + '% (الهدف 3% أو أقل)',
        ...(top.length ? ['', '👏 أكتر مكالمات: ' + top.map(e => e.name + ' (' + (e.answered ?? e.calls) + ')').join('، ')] : [])].join('\n');
      await put('morning:calls:' + day, 'morningCalls', text, null, null);
    }
    if (rules.morningOnline !== false && c.apex?.all) {
      const a = c.apex, r = c.transfers.reasons.slice(0, 4);
      const text = ['🤖 التحويل على Apex — يوم ' + day, '',
        '• أوردرات طلبات والموقع: ' + a.all + ' · اتسجل آلي ' + a.auto + ' (' + fmt(a.autoPct) + '%، الهدف 80%)',
        '• الوقت لحد Apex: ' + fmt(a.toApexMin) + ' د (الهدف 3 د) · استنوا 5 دقايق أو أكتر: ' + a.waited5,
        ...(a.failed ? ['• ماتسجلوش: ' + a.failed] : []),
        ...(r.length ? ['', 'ليه اتسابوا للموظف:', ...r.map(x => '– ' + x.reason + ': ' + x.orders + (x.details.length ? ' (' + x.details.map(d => d.name).join('، ') + ')' : ''))] : [])].join('\n');
      await put('morning:online:' + day, 'morningOnline', text, 'online', null);
    }
    await db.prepare("INSERT INTO settings (key, value) VALUES ('morning_done', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(day);
  };
  app.afterRequest(async now => { try { await app.managerTick(now); } catch {} try { await app.morningTick(now); } catch {} });
}

export { setup };
