'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
test('Talabat live: ID next to item count is read without customer details',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../../extension-3/talabat-monitor.js'),'utf8');
 const reader=s.slice(s.indexOf('    const readCodes = () => {'),s.indexOf('    let lastKey'));
 const dom=new JSDOM('<main><article><b>#8386</b><p>4676719724 • 2 items</p><span>customer name</span><button>Ready</button></article></main>',{runScripts:'outside-only'});
 try {Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});const result=dom.window.eval('(()=>{'+reader+';return readCodes();})()');assert.deepEqual(JSON.parse(JSON.stringify(result)),[{id:'4676719724',code:'8386',store:null}]);}finally{dom.window.close();}
});
