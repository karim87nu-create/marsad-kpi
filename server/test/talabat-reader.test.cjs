'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
test('Talabat detail matching fields stay within the current order and ignore masked phones', () => {
 const s=fs.readFileSync(path.join(__dirname,'../../extension-3/talabat-monitor.js'),'utf8');
 const code=s.slice(s.indexOf('  const T ='),s.indexOf('  // ---------- the operating day'))+'\n'+s.slice(s.indexOf('  function readDetail('),s.indexOf('  // ---------- one cycle'));
 const dom=new JSDOM('<aside>Customer name\nOther Person\nPhone number\n01111111111</aside><section><b data-testid="details-order-id">10000001</b><div data-testid="milestone-for__ACCEPTED">12:01</div><div>Customer name\nAhmed Ali\nDelivery address\nNasr Street 20\nPhone number\n01012345678</div></section>',{runScripts:'outside-only',url:'https://partner-app.talabat.com/orders?placedAt=2026-10-22T12:00:00Z'});
 const w=dom.window;
 try {
  Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return [...this.childNodes].map(n=>n.textContent).join('\n');}});
  const run=()=>JSON.parse(w.eval('(()=>{'+code+';const clockAfter=()=>null;return JSON.stringify(readDetail("10000001"));})()'));
  let r=run();assert.deepEqual(r.detail.customer,{name:'Ahmed Ali',address:'Nasr Street 20',phone:'01012345678'});
  w.document.querySelector('section div:last-child').textContent='Customer name\nAhmed Ali\nPhone number\n010***45678';
  r=run();assert.equal(r.detail.customer.phone,'');assert.equal(r.phone,undefined);
  w.document.querySelector('section div:last-child').innerHTML='<div data-testid="customer-info"><a href="tel:+201012345678">Call customer</a></div>';
  r=run();assert.equal(r.detail.customer.phone,'+201012345678');assert.equal(r.phone,'+201012345678');
  w.document.querySelector('section div:last-child').innerHTML='<div data-testid="restaurant-info"><a href="tel:+201012345678">Call restaurant</a></div>';
  r=run();assert.equal(r.detail.customer.phone,'');
  w.document.querySelector('section div:last-child').textContent='Customer phone number\n01012345678';
  r=run();assert.equal(r.detail.customer.phone,'01012345678');
  assert.equal(w.eval('(()=>{'+code+';return readDetail("99999999");})()'),null);
 }finally{w.close();}
});
test('Talabat live: ID next to item count is read without customer details',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../../extension-3/talabat-monitor.js'),'utf8');
 const reader=s.slice(s.indexOf('    const readCodes = () => {'),s.indexOf('    let lastKey'));
 const dom=new JSDOM('<main><article><b>#8386</b><p>4676719724 • 2 items</p><span>customer name</span><button>Ready</button></article></main>',{runScripts:'outside-only'});
 try {Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});const result=dom.window.eval('(()=>{'+reader+';return readCodes();})()');assert.deepEqual(JSON.parse(JSON.stringify(result)),[{id:'4676719724',code:'8386',store:null}]);}finally{dom.window.close();}
});
test('Talabat history: row times are read in Cairo time and only the operating day is taken', () => {
  const s = fs.readFileSync(path.join(__dirname, '../../extension-3/talabat-monitor.js'), 'utf8');
  const code = s.slice(s.indexOf('  const cairo ='), s.indexOf('  // ---------- a small banner'));
  const f = new Function('Date', code + ';return { rowTime, dayStart, day };');
  const NOW = Date.parse('2026-10-26T16:58:00Z'); // 19:58 Cairo
  class D extends Date { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } }
  const { rowTime, dayStart, day } = f(D);
  const iso = ms => new Date(ms).toISOString();
  assert.equal(day(), '2026-10-26');
  assert.equal(iso(dayStart()), '2026-10-26T06:00:00.000Z');
  assert.equal(iso(rowTime(['ACCEPTED', '4676765944', 'Today, 19:55'])), '2026-10-26T16:55:00.000Z');
  assert.equal(iso(rowTime(['PICKED UP', '4676700000', 'Yesterday, 23:10'])), '2026-10-25T20:10:00.000Z');
  assert.equal(iso(rowTime(['DELIVERED', '4676600000', 'Oct 24, 21:00'])), '2026-10-24T18:00:00.000Z');
  assert.equal(rowTime(['ACCEPTED', '4676765944', 'E£728.25']), null);
});
test('Talabat live: cards whose #code and number are split into pieces, several cards in one list', () => {
  const s = fs.readFileSync(path.join(__dirname, '../../extension-3/talabat-monitor.js'), 'utf8');
  const reader = s.slice(s.indexOf('    const readCodes = () => {'), s.indexOf('    let lastKey'));
  const card = (code, id) => `<div class="card"><div><h3><span>#</span><span>${code}</span></h3><p><span>${id}</span><span> • </span><span>1 item</span></p></div><div><span>customer</span><button>Ready</button></div></div>`;
  const dom = new JSDOM('<main><section>' + card('8403', '4676931567') + card('8404', '4676934244') + card('8405', '4676935878') + '</section></main>', { runScripts: 'outside-only' });
  try {
    const r = JSON.parse(JSON.stringify(dom.window.eval('(()=>{' + reader + ';return readCodes();})()')));
    assert.deepEqual(r.map(x => x.id + ':' + x.code), ['4676931567:8403', '4676934244:8404', '4676935878:8405']);
  } finally { dom.window.close(); }
});
test('Talabat history: the list never asks for a future date, and never from = to', () => {
  const s = fs.readFileSync(path.join(__dirname, '../../extension-3/talabat-monitor.js'), 'utf8');
  const code = s.slice(s.indexOf('  const cairo ='), s.indexOf('  // Talabat refuses')) + s.slice(s.indexOf('  const prev ='), s.indexOf('\n', s.indexOf('  const prev =')) + 1) + s.slice(s.indexOf('  const listUrl'), s.indexOf('\n', s.indexOf('  const listUrl')));
  const at = iso => { const N = Date.parse(iso); class D extends Date { constructor(...a) { super(...(a.length ? a : [N])); } static now() { return N; } } return new Function('Date', code + ';return listUrl();')(D); };
  assert.equal(at('2026-10-26T17:56:00Z'), '/orders?from=2026-10-25&to=2026-10-26');   // 20:56 Cairo
  assert.equal(at('2026-10-26T22:30:00Z'), '/orders?from=2026-10-25&to=2026-10-27');   // 01:30 Cairo, still the 26th's operating day
});
test('Talabat history: a table that only draws the rows on screen is scrolled through and every row is read', async () => {
  const s = fs.readFileSync(path.join(__dirname, '../../extension-3/talabat-monitor.js'), 'utf8');
  const code = s.slice(s.indexOf('  const sleep ='), s.indexOf('\n', s.indexOf('  const sleep ='))) + '\n' +
    s.slice(s.indexOf('  const lines ='), s.indexOf('  // ---------- a small banner')) +
    s.slice(s.indexOf('  function readList()'), s.indexOf('  function readDetail(')) +
    s.slice(s.indexOf('  // The table only draws the rows on screen'), s.indexOf('  async function openDetail('));
  const dom = new JSDOM('<main><div class="MuiDataGrid-virtualScroller"><div id="rows"></div></div></main>', { runScripts: 'outside-only' });
  const w = dom.window, sc = w.document.querySelector('.MuiDataGrid-virtualScroller'), box = w.document.getElementById('rows');
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return [...this.childNodes].map(n => n.textContent).join('\n'); } });
  let top = 0;
  const draw = () => { box.innerHTML = ''; const first = Math.floor(top / 25); for (let i = first; i < Math.min(40, first + 4); i++) box.insertAdjacentHTML('beforeend', `<div class="MuiDataGrid-row" data-id="x|46769${String(10000 + i)}"><span>x</span><span>PICKED UP</span><span>Today, 20:${String(i).padStart(2, '0')}</span><span>E£10.00</span></div>`); };
  Object.defineProperty(sc, 'clientHeight', { get: () => 100 }); Object.defineProperty(sc, 'scrollHeight', { get: () => 1000 });
  Object.defineProperty(sc, 'scrollTop', { get: () => top, set: v => { top = Math.max(0, Math.min(900, v)); draw(); } });
  draw();
  try {
    const rows = await w.eval('(async()=>{' + code + ';return JSON.stringify((await scan()).map(o => o.id));})()');
    assert.equal(JSON.parse(rows).length, 40, 'all 40 rows, not only the 4 drawn on screen');
  } finally { w.close(); }
});
