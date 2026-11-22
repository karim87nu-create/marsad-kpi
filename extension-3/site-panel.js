// The website's central panel / branch boards: passes what the panel itself loaded to the Marsad (through background.js).
// Uses the panel's own controls to send orders to branches and mirror confirmed Apex driver assignments.
(() => {
  // Put back after an update (background.js): never two copies in one page (two «إرسال للفرع» presses).
  if (window.__marsadSitePanel === globalThis.MARSAD?.VERSION) return; window.__marsadSitePanel = globalThis.MARSAD?.VERSION;
  const injectHook = () => {
    const parent = document.head || document.documentElement;
    if (!parent) return false;
    const script = document.createElement('script');
    script.src = browser.runtime.getURL('site-hook.js');
    script.onload = () => script.remove();
    parent.append(script);
    return true;
  };
  if (!injectHook()) {
    const documentReady = new MutationObserver(() => { if (injectHook()) documentReady.disconnect(); });
    documentReady.observe(document, { childList: true });
  }
  const board = /eldahan-operations-central/.test(location.pathname) ? 'central' : 'branch';
  let last = '', lastAt = 0, seenAt = Date.now(), assignedAt = 0;
  // Each order at most 3 tries, 90 s apart; never when the panel shows it already has a branch.
  const tries = new Map();
  const assign = (a, orders) => {
    const id = Number(a.orderId), o = orders.find(x => Number(x.id) === id);
    if (!o || o.branchId) return;
    const t = tries.get(id) || { n: 0, at: 0 }, now = Date.now();
    if (t.n >= 3 || now - t.at < 90000) return;
    const select = document.querySelector('[data-branch-select="' + id + '"]');
    const button = document.querySelector('button[data-action="assign"][data-order="' + id + '"]');
    if (!select || !button || button.disabled || ![...select.options].some(x => x.value === a.branchId)) return;
    tries.set(id, { n: t.n + 1, at: now });
    select.value = a.branchId;
    select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true }));
    // The panel may redraw on «change»: press the button that is on the page now, with the branch still picked.
    const s2 = document.querySelector('[data-branch-select="' + id + '"]'), b2 = document.querySelector('button[data-action="assign"][data-order="' + id + '"]');
    if (s2 && b2 && !b2.disabled) { if (s2.value !== a.branchId) s2.value = a.branchId; assignedAt = Date.now(); b2.click(); }
  };
  const driverName = name => String(name || '').normalize('NFKC').replace(/[\p{M}ـ\u200e\u200f]/gu, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();
  const branchNameFromUrl = {
    'tagamoa-cloud': / (?:فرع )?التجمع(?: الخامس)?$/,
    'nasr-city': / (?:فرع )?مدينه نصر$/,
    'madinaty-craft-zone': / (?:فرع )?مد(?:ي)?نتي$/,
  };
  const branchSuffix = branchNameFromUrl[new URLSearchParams(location.search).get('branch')];
  const rosterName = value => driverName(value.replace(/\s+-\s+\+?[\d٠-٩۰-۹][\d٠-٩۰-۹\s()-]*$/, ''))
    .replace(/(^| )عبد +(?=\p{Script=Arabic})/gu, '$1عبد');
  function selectDriver(input, driver) {
    const wanted = rosterName(driver);
    if (!wanted) return null;
    const options = [...(input.list?.options || [])].map(option => ({ option, name: rosterName(option.value) }));
    const exact = options.filter(e => e.name === wanted);
    if (exact.length > 1) return null;
    // A full exact name is stronger than a longer entry with the same initial words.
    if (exact.length === 1 && wanted.split(' ').length >= 3) return exact[0].option;
    const prefix = branchSuffix ? wanted.replace(branchSuffix, '') : wanted;
    const matches = options.filter(e => e.name === wanted || e.name === prefix || e.name.startsWith(prefix + ' '));
    return matches.length === 1 ? matches[0].option : null;
  }
  const isEditing = except => (document.activeElement !== except && document.activeElement?.matches('select,input,textarea,[contenteditable="true"]')) ||
    document.querySelector('[role="dialog"]:not([hidden]),.eldahan-ops-modal.show,dialog[open]');
  const dispatchTries = new Map();
  const openedDriverForms = new WeakSet(), operatorDriverForms = new WeakSet();
  let dispatching = false, operatorActions = 0, currentOrders = new Map();
  for (const event of ['pointerdown', 'keydown']) {
    document.addEventListener(event, e => {
      if (!e.isTrusted) return;
      operatorActions++;
      if (e.target?.matches?.('input[data-driver-search]')) operatorDriverForms.add(e.target);
    }, true);
  }
  const stillOpen = id => {
    const o = currentOrders.get(id);
    return o && !(Number(o.stage) >= 3) && !o.driver?.name &&
      !(typeof o.driver === 'string' && o.driver.trim()) && !/cancel|refund|failed|deliver(?:ed|ing)/i.test(o.status || '');
  };
  const dispatchOrder = async ({ orderId, driver }) => {
    const focus = document.activeElement;
    const ownFocus = openedDriverForms.has(focus) && !operatorDriverForms.has(focus) ? focus : null;
    if (dispatching || isEditing(ownFocus) || !stillOpen(orderId) || Date.now() - (dispatchTries.get(orderId) || 0) < 25000) return;
    const button = action => {
      const b = document.querySelector('button[data-order="' + orderId + '"][data-action="' + action + '"]');
      return b && !b.disabled ? b : null;
    };
    const form = () => document.querySelector('input[data-driver-search="' + orderId + '"]');
    const unownedForm = () => [...document.querySelectorAll('input[data-driver-search]')].some(input => !openedDriverForms.has(input) || operatorDriverForms.has(input));
    if (unownedForm() || !['prepare', 'ready-pickup', 'dispatch'].some(button) && !form()) return;
    const waitFor = async lookup => {
      for (let i = 0; i < 40; i++) {
        const value = lookup();
        if (value) return value;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      return null;
    };
    const click = b => { assignedAt = Date.now(); b.click(); };
    const started = operatorActions;
    let input = null;
    const interrupted = () => !stillOpen(orderId) || started !== operatorActions || isEditing(input || ownFocus) || unownedForm();
    dispatching = true;
    dispatchTries.set(orderId, Date.now());
    try {
      let dispatch = button('dispatch');
      if (!dispatch && !form()) {
        let ready = button('ready-pickup');
        if (!ready) {
          const prepare = button('prepare');
          if (!prepare) return;
          click(prepare);
          ready = await waitFor(() => button('ready-pickup'));
        }
        if (!ready || interrupted()) return;
        click(ready);
        dispatch = await waitFor(() => button('dispatch'));
      }
      input = form();
      if (!input) {
        if (!dispatch || interrupted()) return;
        click(dispatch);
        input = await waitFor(form);
        if (input) openedDriverForms.add(input);
      }
      if (!input || !openedDriverForms.has(input) || interrupted()) return;
      if (!input.list?.options.length) await waitFor(() => input.list?.options.length || interrupted());
      if (interrupted()) return;
      const selected = selectDriver(input, driver);
      if (!selected) {
        if (document.activeElement === input) input.blur();
        return;
      }
      const value = selected.value;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const submit = await waitFor(() => form()?.value === value && button('dispatch-submit'));
      if (submit && !interrupted()) {
        if (document.activeElement === input) input.blur();
        if (form()?.value !== value || interrupted()) return;
        const confirm = button('dispatch-submit');
        if (!confirm) return;
        dispatchTries.set(orderId, Date.now());
        click(confirm);
        // A disabled submit button can just mean the request is in flight. Check the refreshed order.
        await waitFor(() => !stillOpen(orderId));
      }
    } finally {
      dispatching = false;
    }
  };
  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data.__marsadSite !== 1 || !Array.isArray(e.data.data?.orders)) return;
    seenAt = Date.now();
    const orders = e.data.data.orders.slice(0, 300);
    currentOrders = new Map(orders.map(o => [Number(o.id), o]));
    const key = JSON.stringify(orders.map(o => [o.id, o.stage, o.status, o.branchId, o.lastActionAt, o.driver?.name || null, o.total]));
    const now = Date.now();
    // Every change at once; the same picture again at most once a minute (so delivered = gone from the board stays fresh).
    if (key === last && now - lastAt < 60000) return;
    last = key; lastAt = now;
    // Karim 11-19 «اوردرات الويب سايت بتتأخر … وساعات مش بتظهر»: a picture the Marsad did not take (server busy) used
    // to count as sent, so the same orders waited a minute or more. Now it is sent again with the panel's next refresh.
    const forget = () => { if (last === key) { last = ''; lastAt = 0; } };
    browser.runtime.sendMessage({ type: 'SITE_PANEL', board, dispatchFromApex: board === 'branch', orders, serverTime: e.data.data.serverTime || null })
      .then(async r => {
        if (!r?.ok) return forget();
        if (board === 'central' && Array.isArray(r.assign)) r.assign.forEach(a => assign(a, orders));
        if (board !== 'branch' || !Array.isArray(r.dispatch)) return;
        for (const a of r.dispatch) {
          if (navigator.locks) await navigator.locks.request('marsad-site-dispatch-' + a.orderId, { ifAvailable: true }, lock => lock && dispatchOrder(a));
          else await dispatchOrder(a);
        }
      }).catch(forget);
  });
  // Karim 11-19 «الاضافه تعمل ريفرش لصفحات اللايف للموقع … وميقصرش علي التحويل للفرع»: the panel refreshes itself every
  // 10 s, but after failures it waits up to a minute, and a tab left behind can stop. When no fresh list came for 25 s,
  // the panel's own «تحديث الآن» is pressed; after 2 minutes with nothing, the page is reloaded. Never within 10 s of a
  // «إرسال للفرع» press, and never while someone is choosing or typing on the page.
  // Backoff (11-19, the website refused every device on the network): the extra pushes only happen while the panel is
  // really silent, and each one that brings no list makes the next wait twice as long (reload: 2 min → 4 → … → 30 min;
  // button: 25 s → … → 5 min). The reload step is kept in sessionStorage because a reload restarts this script. A list
  // that arrives puts everything back to the start. A page that is an error page never runs this script at all.
  const KEY = 'marsadSiteBackoff';
  const load = () => { try { const v = JSON.parse(sessionStorage.getItem(KEY) || '{}'); return { reloads: Math.min(Number(v.reloads) || 0, 4), lastReload: Number(v.lastReload) || 0 }; } catch { return { reloads: 0, lastReload: 0 }; } };
  const save = v => { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch {} };
  let pushes = 0, nextPushAt = 0, authExpired = false;
  const AUTH_RELOAD = 'marsadSiteAuthReloadAt';
  const lastAuthReload = () => { try { return Number(sessionStorage.getItem(AUTH_RELOAD)) || 0; } catch { return 0; } };
  window.addEventListener('message', e => {
    if (e.source !== window || e.data?.__marsadSite !== 1) return;
    if (e.data.authExpired === true) { authExpired = true; return; }
    if (!Array.isArray(e.data.data?.orders)) return;
    authExpired = false;
    pushes = 0; nextPushAt = 0; save({ reloads: 0, lastReload: 0 });
  });
  setInterval(() => {
    const now = Date.now(), quiet = now - seenAt;
    if (dispatching || now - assignedAt < 10000 || isEditing()) return;
    // A fresh page requests a new WordPress nonce while its login session is still valid.
    if (authExpired && now - lastAuthReload() >= 5 * 60000) {
      try { sessionStorage.setItem(AUTH_RELOAD, String(now)); } catch {}
      save({ reloads: 1, lastReload: now });
      location.reload();
      return;
    }
    if (quiet < 25000) return;
    const st = load(), gap = Math.min(120000 * 2 ** st.reloads, 30 * 60000);
    if (quiet > gap && now - st.lastReload > gap) { save({ reloads: st.reloads + 1, lastReload: now }); location.reload(); return; }
    if (now < nextPushAt) return;
    const btn = [...document.querySelectorAll('button[data-action="refresh"]')].find(b => !b.disabled);
    if (btn) { pushes++; nextPushAt = now + Math.min(25000 * 2 ** pushes, 300000); btn.click(); }
  }, 5000);
})();
