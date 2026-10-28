const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../../extension-3/whatsapp-sender.js'),'utf8');
function harness(html=''){
 const dom=new JSDOM(html,{url:'https://web.whatsapp.com/'}),w=dom.window;
 Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;},set(v){this.textContent=v;}});
 let saved=null;const reports=[];
 const c={document:w.document,Date,Math,Set,job:{get:()=>saved,set:v=>{saved=v;}},say(){},sleep:async()=>{},loggedIn:()=>true,
 composer:()=>w.document.querySelector('footer [contenteditable]'),sendButton:()=>w.document.querySelector('footer button'),invalidNumber:()=>false,
 bg:async m=>{reports.push(m);return {ok:true};}};
 vm.createContext(c);const code=source.slice(source.indexOf('  const report ='),source.indexOf('  const pending ='));
 vm.runInContext(code+';this.finish=finish;this.report=report;',c);
 return {c,w,reports,get saved(){return saved;},close:()=>w.close()};
}
test('lost result acknowledgement remains durable and retries the result without sending again',async()=>{
 const h=harness();try{let attempts=0;h.c.bg=async()=>{if(++attempts===1)throw Error('offline');return {ok:true};};
 const j={id:1,kind:'welcome',claimToken:'claim',text:'hello'};
 assert.equal(await h.c.report(j,true),false);assert.equal(h.saved.phase,'result');assert.equal(h.saved.result.ok,true);
 await h.c.finish(h.saved);assert.equal(h.saved,null);assert.equal(attempts,2);
 }finally{h.close();}
});
test('a page restored after a click never clicks send a second time',async()=>{
 const h=harness('<footer><div contenteditable="true">hello</div><button>Send</button></footer>');try{
 let clicks=0;h.w.document.querySelector('button').onclick=()=>clicks++;
 await h.c.finish({id:1,kind:'welcome',claimToken:'claim',text:'hello',phase:'clicked'});
 assert.equal(clicks,0);assert.equal(h.reports[0].ok,false);
 }finally{h.close();}
});
test('only the requested draft is sent and success requires a new outgoing message',async()=>{
 const h=harness('<footer><div contenteditable="true">hello</div><button>Send</button></footer>');try{
 let clicks=0;h.w.document.querySelector('button').onclick=()=>{clicks++;assert.equal(h.saved.phase,'clicked');h.w.document.querySelector('[contenteditable]').textContent='';h.w.document.body.insertAdjacentHTML('beforeend','<div class="message-out"><span class="selectable-text">hello</span></div>');};
 await h.c.finish({id:1,kind:'welcome',claimToken:'claim',text:'hello'});
 assert.equal(clicks,1);assert.equal(h.reports[0].ok,true);
 h.w.document.querySelector('[contenteditable]').textContent='unrelated draft';
 await h.c.finish({id:2,kind:'welcome',claimToken:'other',text:'hello'});assert.equal(clicks,1);assert.equal(h.reports[1].ok,false);
 }finally{h.close();}
});
