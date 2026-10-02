(function(){
  const Native=window.EventSource;if(!Native)return;
  const known=['agentlinked','agentunlinked','breakenter','breakexit','agentloggedin','agentloggedout','queueenter','queue_enter','callqueue','callabandoned','abandoned','queueleave'];
  const Wrapped=function(...args){const es=new Native(...args);const add=es.addEventListener.bind(es),forwarded=new Set();const forward=type=>{if(forwarded.has(type))return;forwarded.add(type);add(type,e=>window.postMessage({source:'ARABICSS_KPI_SSE',type,data:e.data},location.origin))};known.forEach(forward);es.addEventListener=(type,listener,options)=>{forward(String(type));return add(type,listener,options)};return es};
  Object.setPrototypeOf(Wrapped,Native);Wrapped.prototype=Native.prototype;window.EventSource=Wrapped;
})();
