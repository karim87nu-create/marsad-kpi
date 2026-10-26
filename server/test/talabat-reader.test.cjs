'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
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
