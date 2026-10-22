(function(){
 if(window.__marsadReportHook)return;window.__marsadReportHook=true;
 const bytes=crypto.getRandomValues(new Uint8Array(16)),hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''),pageId=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');let sequence=0;
 // Observe only the report's own successful XHR. Never issue, cancel or retry
 // Arabicss requests, or touch the agent console / break transport.
 const matches=raw=>{try{const u=new URL(raw,location.href);return u.origin===location.origin&&/^\/themes\/arabicssReportsInclude\/dark\/get_inbound_calls_real_time\.php$/.test(u.pathname)}catch{return false}};
 const XHR=window.XMLHttpRequest;if(!XHR)return;
 const open=XHR.prototype.open,send=XHR.prototype.send;
 XHR.prototype.open=function(method,url,...rest){if(this._marsadReportLoad)this.removeEventListener('load',this._marsadReportLoad);this._marsadReportLoad=null;this._marsadReportUrl=String(url);this._marsadReportSequence=matches(url)?++sequence:0;return open.call(this,method,url,...rest)};
 XHR.prototype.send=function(...args){
  if(matches(this._marsadReportUrl)){
   const requestSequence=this._marsadReportSequence;
   const loaded=()=>{try{if(this.status<200||this.status>=300||!matches(this.responseURL||this._marsadReportUrl)||this.responseType&&this.responseType!=='text')return;const html=this.responseText;if(typeof html==='string'&&html.length<=1000000)window.postMessage({source:'MARSAD_NATIVE_REPORT',html,pageId,sequence:requestSequence},location.origin)}catch{}};
   this._marsadReportLoad=loaded;this.addEventListener('load',loaded,{once:true});
  }
  return send.apply(this,args);
 };
})();
