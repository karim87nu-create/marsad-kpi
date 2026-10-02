const API='https://marsad-kpi-live.karim87nu.chatgpt.site',ROOT='https://41.38.207.218:11594/themes/arabicssReportsInclude/dark/';
const employeeRuntimeEpoch=crypto.randomUUID();
let busy=false,liveBusy=false,status={message:'موصل الإدارة غير مفعّل'};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const config=async()=> (await browser.storage.local.get('historyCollector')).historyCollector;
async function request(url,options={}){const c=new AbortController(),t=setTimeout(()=>c.abort(),20000);try{return await fetch(url,{...options,signal:c.signal,cache:'no-store'})}finally{clearTimeout(t)}}
async function post(body,token){const r=await request(API+'/api/history',{method:'POST',headers:{'content-type':'application/json','x-history-token':token},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(r.status===401?'انتهت صلاحية موصل الإدارة؛ أعد تفعيله':d.error||'تعذر حفظ السجل');return d}
async function source(path,options={}){const r=await request(ROOT+path,{...options,credentials:'include'}),html=await r.text();if(!r.ok||/login\.php/i.test(r.url)||/<input[^>]+type=["']password/i.test(html))throw Error('سجل دخول إدارة أرابيكس مرة واحدة ثم أعد المحاولة');return html}
async function collectHistory(){
 if(busy)return;const cfg=await config();if(!cfg?.enabled)return;busy=true;
 try{let date=cfg.nextDate||cfg.startDate;const end=today();
 for(let step=0;step<14&&date<=end;step++){
 const [y,m,d]=date.split('-'),v=m+'/'+d+'/'+y,html=await source('0002_inbound_calls.php',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({start_date:v,end_date:v}).toString()});
 const doc=new DOMParser().parseFromString(html,'text/html'),table=doc.querySelector('#example23');if(!table)throw Error('لم يتم التعرف على جدول السجل');
 const header=Array.from(table.querySelectorAll('thead th')).map(c=>c.textContent.trim()),rows=Array.from(table.querySelectorAll('tbody tr')).map(row=>Array.from(row.querySelectorAll('td')).map(c=>c.textContent.trim())).filter(r=>r.length===10);
 const label=Array.from(doc.querySelectorAll('h5')).find(e=>e.textContent.trim()==='All Inbound Calls'),count=Number(label?.previousElementSibling?.textContent.trim());
 if(!label||!Number.isInteger(count)||count!==rows.length)throw Error('السجل ناقص؛ لم تُحسب الفترة');
 const di=header.indexOf('Call Date');if(di<0||rows.some(r=>r[di]!==date))throw Error('التاريخ الذي أعاده أرابيكس لا يطابق المطلوب');
 await post({rows:[header,...rows],expectedCount:count,reportDate:date},cfg.token);
 status={...status,message:'تم استكمال سجل '+date+' ('+rows.length+' مكالمة)',lastHistory:new Date().toISOString()};
 const current=await config();if(!current?.enabled||current.token!==cfg.token)break;
 const done=date===end;date=done?date:new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 await browser.storage.local.set({historyCollector:{...current,nextDate:date}});if(done)break;
 }
 }catch(e){status={...status,message:e.message||'تعذر سحب السجل؛ راجع الاتصال وشهادة أرابيكس'}}finally{busy=false}
}
async function collectLive(){
 if(liveBusy)return;const cfg=await config();if(!cfg?.enabled)return;liveBusy=true;
 try{const html=await source('get_inbound_calls_real_time.php'),doc=new DOMParser().parseFromString('<table><tbody>'+html+'</tbody></table>','text/html'),rows=Array.from(doc.querySelectorAll('tr')).map(row=>Array.from(row.querySelectorAll('td')).map(c=>c.textContent.trim())).filter(r=>r.length===11);
 if(html.trim()&&!rows.length)throw Error('رد اللايف غير معروف؛ اللقطة السابقة لم تُحدّث');
 await post({action:'live',rows},cfg.token);status={...status,lastLive:new Date().toISOString(),liveError:null}
 }catch(e){status={...status,liveError:e.message||'تعذر سحب اللايف'}}finally{liveBusy=false}
}
browser.runtime.onMessage.addListener(async(message,sender)=>{
 if(message?.type==='EMPLOYEE_RUNTIME_EPOCH'){
  if(!sender.tab||!/^https?:\/\/41\.38\.207\.218(?::11594)?\//.test(sender.url||''))throw Error('invalid_sender');
  return {epoch:employeeRuntimeEpoch};
 }
 if(String(message?.type||'').startsWith('COLLECTOR_')){
 if(sender.url!==browser.runtime.getURL('collector.html'))throw Error('invalid_sender');
 if(message.type==='COLLECTOR_STATUS'){const c=await config();return{...status,config:c?{enabled:c.enabled,startDate:c.startDate,nextDate:c.nextDate}:null}}
 if(message.type==='COLLECTOR_STOP'){await browser.storage.local.remove('historyCollector');status={message:'موصل الإدارة متوقف'};return{ok:true}}
 if(message.type==='COLLECTOR_SYNC'){collectHistory();collectLive();return{ok:true}}
 if(message.type==='COLLECTOR_SETUP'){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(message.startDate)||message.startDate>today())throw Error('اختر تاريخ بداية صحيحًا');
 const r=await request(API+'/api/history',{method:'POST',headers:{'content-type':'application/json','x-admin-password':message.password},body:JSON.stringify({action:'token'})}),d=await r.json();if(!r.ok)throw Error('كلمة مرور إدارة KPI غير صحيحة');
 await browser.storage.local.set({historyCollector:{enabled:true,token:d.token,startDate:message.startDate,nextDate:message.startDate}});status={message:'جارٍ استكمال السجل'};collectHistory();collectLive();return{ok:true}
 }return;
 }
 if(message?.type!=='KPI_API')return;
 if(!sender.url||new URL(sender.url).hostname!=='41.38.207.218')throw Error('invalid_sender');
 const path=String(message.path||'');if(!/^\/api\/(employees\/list(?:\?.*)?|session\/start|events)$/.test(path))throw Error('invalid_path');
 const r=await request(API+path,{method:message.method||'GET',headers:message.headers||{},body:message.body});return{status:r.status,ok:r.ok,body:await r.text()}
});
setInterval(collectHistory,300000);setInterval(collectLive,5000);collectHistory();collectLive();
