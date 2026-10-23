(function(){
 if(globalThis.__marsadReportBridge)return;globalThis.__marsadReportBridge=true;
 if(location.hostname!=='41.38.207.218'||location.pathname!=='/themes/arabicssReportsInclude/dark/0004_inbound_calls.php')return;
 window.addEventListener('message',e=>{
  if(e.source!==window||e.origin!==location.origin||e.data?.source!=='MARSAD_NATIVE_REPORT'||typeof e.data.html!=='string'||e.data.html.length>1000000)return;
  browser.runtime.sendMessage({type:'NATIVE_REPORT_LIVE',html:e.data.html,pageId:e.data.pageId,sequence:e.data.sequence}).catch(()=>{});
 });
 const script=document.createElement('script');script.src=browser.runtime.getURL('report-hook.js');script.onload=()=>script.remove();
 (document.head||document.documentElement).appendChild(script);
})();
