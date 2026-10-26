'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
test('admin actual HTML script order shows the login screen without a session', async()=>{
 const root=path.join(__dirname,'../../sites/public/admin');
 const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://example.test/admin/',runScripts:'outside-only',pretendToBeVisual:true});
 try{
 const w=dom.window;w.fetch=async()=>({ok:true,status:200,json:async()=>({needed:false})});
 for(const script of w.document.querySelectorAll('script[src]'))w.eval(fs.readFileSync(path.join(root,script.getAttribute('src').split('?')[0]),'utf8'));
 await new Promise(r=>setTimeout(r,0));
 assert.equal(w.document.getElementById('login').hidden,false);
 assert.equal(w.document.getElementById('app').hidden,true);
 assert.equal(typeof w.document.getElementById('loginForm').onsubmit,'function');
 }finally{dom.window.close();}
});
