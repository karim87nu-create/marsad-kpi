const message=document.getElementById('message');
async function refresh(){try{const s=await browser.runtime.sendMessage({type:'COLLECTOR_STATUS'});message.textContent=s.message+(s.lastHistory?'\nآخر تاريخ سجل: '+s.lastHistory.slice(0,10):'')+(s.lastLive?'\nآخر وصول لايف: '+new Date(s.lastLive).toLocaleTimeString('ar-EG'):'')+(s.liveError?'\n'+s.liveError:'')}catch{message.textContent='تعذر التواصل مع الموصل'}}
let actionBusy=false;
const sync=document.getElementById('sync'),stop=document.getElementById('stop');
async function act(type){if(actionBusy)return;actionBusy=true;sync.disabled=stop.disabled=true;message.textContent=type==='COLLECTOR_SYNC'?'جارٍ استئناف المزامنة والتحقق من وصول اللايف…':'جارٍ إيقاف المزامنة…';try{const result=await browser.runtime.sendMessage({type});await refresh();if(result?.ok===false)message.textContent=result.error||'لم تنجح المزامنة؛ راجع حالة الربط';}catch(error){message.textContent='تعذر تنفيذ الإجراء: '+error.message}finally{actionBusy=false;sync.disabled=stop.disabled=false}}
sync.onclick=()=>act('COLLECTOR_SYNC');stop.onclick=()=>act('COLLECTOR_STOP');refresh();setInterval(()=>{if(!actionBusy)refresh()},3000);
