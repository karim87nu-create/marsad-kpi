browser.runtime.onMessage.addListener(async(message,sender)=>{
if(message?.type!=='KPI_API')return;
if(!sender.url||new URL(sender.url).hostname!=='41.38.207.218')throw new Error('invalid_sender');
const path=String(message.path||'');
if(!/^\/api\/(employees\/list(?:\?.*)?|session\/start|events)$/.test(path))throw new Error('invalid_path');
const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
try{const response=await fetch('https://marsad-kpi-live.karim87nu.chatgpt.site'+path,{method:message.method||'GET',headers:message.headers||{},body:message.body,cache:'no-store',signal:controller.signal});return{status:response.status,ok:response.ok,body:await response.text()}}finally{clearTimeout(timeout)}
});