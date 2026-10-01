(function(){
  const Native=window.EventSource;if(!Native)return;
  const Wrapped=function(...args){const es=new Native(...args);['agentlinked','agentunlinked','breakenter','breakexit','agentloggedin','agentloggedout'].forEach(type=>es.addEventListener(type,e=>window.postMessage({source:'ARABICSS_KPI_SSE',type,data:e.data},location.origin)));return es};
  Object.setPrototypeOf(Wrapped,Native);Wrapped.prototype=Native.prototype;window.EventSource=Wrapped;
})();

