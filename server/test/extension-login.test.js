'use strict';
// The employee enters the password on the Arabicss sign-in page, then goes through Arabicss's own
// pages: main login → (signed in) → agent console login → agent console. The password must be asked once.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { start } = require('./helpers');

let JSDOM, VirtualConsole;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch {}
const OLD_API = 'https://marsad-kpi-live.karim87nu.chatgpt.site';
const settle = ms => new Promise(r => setTimeout(r, ms));

const PAGES = {
  mainLogin: ['/index.php', '<div class="login-form"><form method="post"><input name="input_user" type="text"><input name="input_pass" type="password"><button name="submit_login" type="submit">Login</button></form></div>'],
  signedIn: ['/index.php', '<div id="issabel_framework_module_id"></div><a href="?logout=yes">Logout</a><a href="?menu=agent_console">Agent Console</a>'],
  agentLogin: ['/index.php?menu=agent_console', '<h1>Agent Console</h1><label>Agent</label><input type="text" name="agent"><label>Callback Extension</label><input type="text" name="ext"><input type="password" name="pass"><button>Log in</button>'],
  console: ['/index.php?menu=agent_console', '<div id="issabel-callcenter-titulo-consola">Agent Console - SIP/101</div><div id="issabel-callcenter-cronometro">00:00:00</div><a href="?logout=yes">x</a>'],
};

async function journey(folder) {
  const EXT = path.join(__dirname, '..', '..', folder);
  const t = await start({ at: Date.now() });
  Object.defineProperty(t.clock, 'now', { get: () => Date.now(), set() {} });
  const read = f => fs.readFileSync(path.join(EXT, f), 'utf8').split(OLD_API).join(t.base);
  const windows = [];
  try {
    const admin = await t.admin();
    await t.employee(admin);
    const store = {}, listeners = [];
    const browser = {
      storage: { local: { get: async k => ({ [k]: structuredClone(store[k]) }), set: async o => { Object.assign(store, structuredClone(o)); }, remove: async k => { delete store[k]; } } },
      runtime: { onStartup: { addListener() {} }, onMessage: { addListener: f => listeners.push(f) }, getURL: x => 'moz-extension://x/' + x, id: 'x' },
      tabs: { query: async () => [{ id: 7, url: 'https://41.38.207.218/index.php' }], onRemoved: { addListener() {} } },
      browserAction: { onClicked: { addListener() {} } }, notifications: { create: async () => {} },
    };
    const bg = { console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, setInterval: () => 0, performance, crypto: globalThis.crypto,
      Intl, Date, JSON, Math, Promise, Error, Number, String, Array, Object, Map, Set, structuredClone, DOMParser: class {}, fetch, browser };
    bg.globalThis = bg;
    vm.createContext(bg);
    for (const f of ['availability.js', 'native-live-capture.js', 'background.js', 'message-notifications.js']) vm.runInContext(read(f), bg, { filename: f });
    let current = '';
    const toBackground = async message => {
      const sender = { tab: { id: 7 }, url: current };
      for (const f of listeners) { const r = await f(structuredClone(message), sender); if (r !== undefined) return structuredClone(r); }
    };
    // Each page is a new document in the same tab: new scripts and an empty sessionStorage.
    async function open(name) {
      const [route, body] = PAGES[name];
      windows.at(-1)?.close();
      current = 'https://41.38.207.218' + route;
      const dom = new JSDOM('<!doctype html><html><body>' + body + '</body></html>', { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole(), url: current });
      const w = dom.window;
      windows.push(w);
      w.postMessage = (data, target) => { if (target === w.location.origin) setTimeout(() => w.dispatchEvent(new w.MessageEvent('message', { data, origin: w.location.origin, source: w })), 0); };
      w.browser = { runtime: { sendMessage: toBackground, getURL: x => 'moz-extension://x/' + x } };
      w.document.documentElement.appendChild = (orig => function (n) { if (n.tagName === 'SCRIPT') { n.onload?.(); return n; } return orig.call(this, n); })(w.document.documentElement.appendChild);
      for (const f of ['availability.js', 'content.js', 'employee-messages.js', 'break-requests.js']) w.eval(read(f));
      await settle(1200);
      return w;
    }
    const sessions = () => t.app.db.prepare('SELECT * FROM employee_sessions ORDER BY id').all();
    let w = await open('mainLogin');
    w.document.getElementById('kpi-pin').value = '1234';
    w.document.getElementById('kpi-start').click();
    await settle(1500);
    assert.match(w.document.getElementById('kpi-name').textContent, /Ahmed/);
    const steps = [];
    for (const name of ['signedIn', 'agentLogin', 'console']) {
      w = await open(name);
      const name2 = w.document.getElementById('kpi-name')?.textContent || '';
      steps.push({ page: name, signedIn: /Ahmed/.test(name2) && w.document.getElementById('kpi-form').hidden, sessions: sessions().length, open: sessions().filter(s => !s.revoked_at).length });
    }
    return { steps, sessions: sessions() };
  } finally {
    for (const w of windows) w.close();
    await t.close();
  }
}

test('2.5.34: password entered once survives the Arabicss login pages', { skip: !JSDOM && 'jsdom not installed' }, async () => {
  const r = await journey('extension-2.5.34');
  assert.deepEqual(r.steps.map(s => s.signedIn), [true, true, true], JSON.stringify(r.steps));
  assert.equal(r.sessions.length, 1);
  assert.equal(r.sessions[0].revoked_at, null);
  assert.equal(r.sessions[0].extension, '101');               // bound once the console opened
});

test('2.5.33 (published): the agent console login page ends the identity — the double password', { skip: !JSDOM && 'jsdom not installed' }, async () => {
  const r = await journey('extension-2.5.33');
  assert.equal(r.steps.find(s => s.page === 'agentLogin').signedIn, false, JSON.stringify(r.steps));
  assert.equal(r.sessions[0].revoke_reason, 'arabicss_login_page');
});
