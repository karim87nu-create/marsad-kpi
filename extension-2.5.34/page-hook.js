(function(){
 if(window.__marsadSourceHook)return;window.__marsadSourceHook=true;
 const post=(type,payload)=>window.postMessage({source:'ARABICSS_KPI_SSE',type,data:JSON.stringify(payload)},location.origin);
 let connection='unknown',receivedAt=null,observeExistingSource=()=>{},sourceDiagnostics=()=>({transport:'unknown'}),fallbackActive=false;
 let fallbackInFlight=false,fallbackStopped=false,fallbackTimer=null,lastFallbackStart=-Infinity;
 const stopFallback=()=>{fallbackStopped=true;fallbackInFlight=false;if(fallbackTimer!==null){clearTimeout(fallbackTimer);fallbackTimer=null}};
 const monotonic=()=>typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now();
 const announce=state=>{if(state!==connection){connection=state;post('source_connection',{state})}};
 const recordsFrom=data=>{if(!data||typeof data!=='object')return [];return typeof data.event==='string'?[data]:Object.values(data)};
 const sourceState=()=>({break_id:window.estadoCliente?.break_id??null,callid:window.estadoCliente?.callid??null});
 // Native handlers can run before our listener (late SSE attachment/jQuery
 // XHR). Never infer the pre-event state from an already updated native DOM.
 const emitRecords=(list,previous=sourceState())=>{receivedAt=new Date().toISOString();for(const record of list)if(record&&typeof record.event==='string'){
  const type=record.event.toLowerCase();if(['agentloggedout','logged-out'].includes(type))stopFallback();
  post(record.event,{...record,_previousBreakId:previous.break_id,_previousCallId:previous.callid,_receivedAt:receivedAt,_sourceEvent:String(record.event),_sourceConnection:connection});
  if(type==='breakenter')previous.break_id=record.break_id??null;else if(type==='breakexit')previous.break_id=null;
  else if(type==='agentlinked')previous.callid=record.callid??null;else if(type==='agentunlinked')previous.callid=null;
 }};
 // Arabicss End session uses an AJAX agentLogout request, not a browser logout.
 const XHR=window.XMLHttpRequest;
 if(XHR){const open=XHR.prototype.open,send=XHR.prototype.send;
  XHR.prototype.open=function(method,url,...rest){for(const [type,fn] of this._kpiListeners||[])this.removeEventListener?.(type,fn);this._kpiListeners=[];this._kpiUrl=String(url);return open.call(this,method,url,...rest)};
  XHR.prototype.send=function(body){
   try{const u=new URL(this._kpiUrl,location.origin),p=new URLSearchParams(typeof body==='string'?body:'');
    const action=p.get('action')||u.searchParams.get('action');
    if(u.origin===location.origin&&['agentLogout','checkStatus','break','unbreak'].includes(action)){
     const previous=sourceState();
     const breakAction=action==='break'||action==='unbreak';
     // Arabicss owns the polling/retry loop. Bound only the fallback's native
     // long-poll, with room for its normal ~120-second idle response.
     if(action==='checkStatus'&&fallbackActive&&!this.timeout)this.timeout=130000;
     if(action!=='checkStatus'&&!this.timeout)this.timeout=20000;
     const listen=(type,fn)=>{this._kpiListeners.push([type,fn]);this.addEventListener(type,fn,{once:true})};
     if(action==='checkStatus'&&fallbackActive)listen('loadend',()=>{fallbackInFlight=false});
     if(action==='agentLogout')post('logout_attempt',{source:'agentLogout'});
     if(breakAction)post('native_break_attempt',{action});
     listen('load',()=>{
      if(breakAction){let r=null;try{r=typeof this.response==='object'&&this.response?this.response:JSON.parse(this.responseText)}catch{}
       const confirmed=this.status>=200&&this.status<300&&!!r&&['ok','success'].includes(String(r.action||'').toLowerCase())&&r.success!==false&&!r.error&&r.statusResponse!=='ERROR_SESSION';
       post('native_break_result',{action,confirmed,failed:this.status<200||this.status>=300||!r||r.action==='error'||r.success===false||!!r.error||r.statusResponse==='ERROR_SESSION'});return}
      if(this.status<200||this.status>=300){if(action==='agentLogout')post('logout_result',{confirmed:false,failed:true});else if(fallbackActive)announce('disconnected');return}
      try{const r=typeof this.response==='object'&&this.response?this.response:JSON.parse(this.responseText);
       if(action==='checkStatus'){const list=recordsFrom(r);if(r?.statusResponse==='ERROR_SESSION'){stopFallback();announce('disconnected');return}if(Array.isArray(r)||list.some(record=>typeof record?.event==='string')){announce('connected');emitRecords(list,previous)}else if(fallbackActive)announce('disconnected');return}
       const confirmed=!!r&&['ok','success'].includes(String(r.action||'').toLowerCase())&&r.success!==false&&!r.error;
       post('logout_result',{confirmed,failed:!!r&&(r.action==='error'||r.success===false||!!r.error)});
       if(confirmed){stopFallback();post('agentloggedout',{confirmed:true,source:'agentLogout'})}
      }catch{if(action==='agentLogout')post('logout_result',{confirmed:false,failed:true});else if(fallbackActive)announce('disconnected')}
     });
     for(const type of ['error','abort','timeout'])listen(type,()=>{if(breakAction)post('native_break_result',{action,confirmed:false,failed:true});else if(action==='agentLogout')post('logout_result',{confirmed:false,failed:true});else announce('disconnected')});
    }
   }catch{}
   return send.call(this,body);
  };
 }
 const Native=window.EventSource;
 if(Native){
  const sources=new Map(),attached=new WeakSet();let primaryUrl='',primaryProven=false,connectingSource=null,connectingSince=0;
  const agentEvents=new Set(['agentlinked','agentunlinked','breakenter','breakexit','agentloggedin','agentloggedout','logged-out']);
  const sourceKey=raw=>{try{const u=new URL(String(raw),location.origin);return u.origin+u.pathname+'|'+(u.searchParams.get('menu')||'')+'|'+(u.searchParams.get('action')||'')}catch{return String(raw)}};
  const update=()=>{if(fallbackActive)return;const native=window.evtSource,exact=sources.get(native);const useNative=primaryProven&&native&&sourceKey(native.url||'index.php?menu=agent_console&action=checkStatus')===primaryUrl;const states=useNative?(exact?[exact]:[]):[...sources.values()].filter(s=>s.url===primaryUrl);const next=states.some(s=>s.open)?'connected':'disconnected';if(next!==connection){connection=next;post('source_connection',{state:connection})}};
  const attach=(es,raw,confirmed=false)=>{
   if(!es||typeof es.addEventListener!=='function'||es.readyState===2)return;
   const url=sourceKey(raw);if(confirmed){primaryUrl=url;primaryProven=true}else if(!primaryUrl)primaryUrl=url;
   if(attached.has(es)){update();return}attached.add(es);
   const add=es.addEventListener.bind(es);sources.set(es,{url,open:es.readyState===1,previous:sourceState()});
   add('open',()=>{const s=sources.get(es);if(s)s.open=true;update()});
   add('error',()=>{const s=sources.get(es);if(s)s.open=false;if(es.readyState===2)sources.delete(es);update()});
   if(typeof es.close==='function'){const close=es.close.bind(es);es.close=function(...values){try{return close(...values)}finally{sources.delete(es);update()}}}
   add('message',e=>{
    if(es.readyState===2||fallbackActive)return;
    let records;try{records=JSON.parse(e.data)}catch{return}
    if(!records||typeof records!=='object')return;
    const list=typeof records.event==='string'?[records]:Object.values(records);
    // The first constructor is only provisional: an unrelated stream may be
    // created before Arabicss. Agent lifecycle evidence selects the real URL.
    if(!primaryProven&&list.some(record=>record&&agentEvents.has(String(record.event||'').toLowerCase()))){primaryUrl=url;primaryProven=true;}
    if(url!==primaryUrl)return;
    if(primaryProven&&window.evtSource&&window.evtSource!==es)return;
    const s=sources.get(es);if(s)s.open=true;update();emitRecords(list,s?.previous);
   });
   if(es.readyState===1)update();
  };
  const Wrapped=function(...args){const es=new Native(...args);attach(es,args[0]);return es};
  Object.setPrototypeOf(Wrapped,Native);Wrapped.prototype=Native.prototype;window.EventSource=Wrapped;
  // Arabicss exposes the already-created agent stream as evtSource. Attach
  // to that exact instance; never construct or reconnect another stream.
  // Reconcile against the native object, not only our last open/error event.
  // The hook can miss a transition while being attached during page startup.
  // CONNECTING/CLOSED must never be promoted to connected from cached DOM state.
  observeExistingSource=()=>{
   let changed=false;
   for(const [es,state] of sources){if(es.readyState===2){sources.delete(es);changed=true}else if(typeof es.readyState==='number'&&state.open!==(es.readyState===1)){state.open=es.readyState===1;changed=true}}
   const native=window.evtSource;
   if(native&&!fallbackActive)attach(native,native.url||'index.php?menu=agent_console&action=checkStatus',true);
   if(changed)update();
   if(fallbackActive)return;
   // A present constructor does not guarantee a working stream. Use only
   // Arabicss's exact native source and native fallback function, once/page.
   // No additional EventSource, fabricated idle state or break action.
   if(native?.readyState!==0){connectingSource=null;return}
   if(connectingSource!==native){connectingSource=native;connectingSince=monotonic();return}
   if(monotonic()-connectingSince<35000||typeof window.do_checkstatus!=='function')return;
   const nativePoll=window.do_checkstatus;
   // One native request owner. Native callbacks can request the next poll at
   // 1ms, but immediate/empty replies must not produce a request flood.
   const fallbackPoll=function(...args){
    if(fallbackStopped||fallbackInFlight||fallbackTimer!==null)return;
    const wait=1000-(monotonic()-lastFallbackStart);
    if(wait>0){const receiver=this;fallbackTimer=setTimeout(()=>{fallbackTimer=null;fallbackPoll.apply(receiver,args)},wait);return}
    const constructor=window.EventSource;window.EventSource=undefined;fallbackInFlight=true;lastFallbackStart=monotonic();
    try{return nativePoll.apply(this,args)}catch{fallbackInFlight=false;announce('disconnected');const receiver=this;fallbackTimer=setTimeout(()=>{fallbackTimer=null;fallbackPoll.apply(receiver,args)},5000)}finally{window.EventSource=constructor}
   };
   fallbackActive=true;announce('unknown');
   try{native.close();window.evtSource=null;window.do_checkstatus=fallbackPoll;fallbackPoll()}catch{announce('disconnected')}
  };
  sourceDiagnostics=()=>({transport:fallbackActive?'native_long_poll':'sse',nativeReadyState:typeof window.evtSource?.readyState==='number'?window.evtSource.readyState:null,trackedStreams:sources.size,primaryProven,fallbackActive});
  observeExistingSource();
 }
 let previous='',lastSent=0;
 setInterval(()=>{
  observeExistingSource();
  const s=window.estadoCliente;
  if(!s||!Object.prototype.hasOwnProperty.call(s,'break_id')||!document.querySelector('#issabel-callcenter-titulo-consola'))return;
  const title=document.querySelector('#issabel-callcenter-titulo-consola')?.textContent||'',extension=(title.match(/(?:SIP|IAX2)\/(\d+)/i)||[])[1]||'';
  const payload={break_id:s.break_id,callid:s.callid,calltype:s.calltype,waitingcall:s.waitingcall,onhold:s.onhold,connection,receivedAt,extension,sourceDiagnostics:sourceDiagnostics()};
  const serialized=JSON.stringify(payload);
  if(serialized!==previous||Date.now()-lastSent>=5000){previous=serialized;lastSent=Date.now();post('arabicss_state',payload)}
 },1000);
})();

