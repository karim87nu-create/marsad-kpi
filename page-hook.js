(function(){
 const post=(type,payload)=>window.postMessage({source:'ARABICSS_KPI_SSE',type,data:JSON.stringify(payload)},location.origin);
 let connection='unknown',receivedAt=null;
 const Native=window.EventSource;
 if(Native){
  const Wrapped=function(...args){
   const es=new Native(...args),add=es.addEventListener.bind(es);
   add('open',()=>{connection='connected';post('source_connection',{state:connection})});
   add('error',()=>{connection='disconnected';post('source_connection',{state:connection})});
   add('message',e=>{
    let records;try{records=JSON.parse(e.data)}catch{return}
    if(!records||typeof records!=='object')return;
    connection='connected';receivedAt=new Date().toISOString();
    const list=typeof records.event==='string'?[records]:Object.values(records);
    for(const record of list)if(record&&typeof record.event==='string')post(record.event,{...record,_previousBreakId:window.estadoCliente?.break_id??null,_previousCallId:window.estadoCliente?.callid??null});
   });
   return es;
  };
  Object.setPrototypeOf(Wrapped,Native);Wrapped.prototype=Native.prototype;window.EventSource=Wrapped;
 }
 let previous='',lastSent=0;
 setInterval(()=>{
  const s=window.estadoCliente;
  if(!s||!Object.prototype.hasOwnProperty.call(s,'break_id')||!document.querySelector('#issabel-callcenter-titulo-consola'))return;
  const payload={break_id:s.break_id,callid:s.callid,calltype:s.calltype,waitingcall:s.waitingcall,onhold:s.onhold,connection,receivedAt};
  const serialized=JSON.stringify(payload);
  if(serialized!==previous||Date.now()-lastSent>=5000){previous=serialized;lastSent=Date.now();post('arabicss_state',payload)}
 },1000);
})();
