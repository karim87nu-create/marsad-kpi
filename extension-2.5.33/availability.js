(function(){
 // Connectivity is not identity. Neither authentication denial nor rate limits
 // authorize bypass. No persistent flag or user-accessible bypass button.
 globalThis.createKpiAvailability=()=>{
  let failures=0,firstFailure=null,outage=false,recovered=false;
  return {
   observe(result,now=Date.now()){
    if(result==='unavailable'){
     if(firstFailure===null)firstFailure=now;
     failures++;recovered=false;
     if(failures>=3&&now-firstFailure>=30000)outage=true;
    }else if(result==='healthy'){
     failures=0;firstFailure=null;recovered=true;
    }else if(result==='denied'){
     failures=0;firstFailure=null;recovered=true;
    }
    return this.state();
   },
   settle(canGate){if(outage&&recovered&&canGate)outage=false;return this.state()},
   state(){return {outage,recovered,failures}}
  };
 };
})();

// Use the first-party HTTPS response Date as a UTC anchor. Progress from a
// monotonic clock, so changing the Windows clock cannot move new events.
globalThis.createKpiClock=()=>{
 const monotonic=()=>globalThis.performance?.now?.()??Date.now();
 let anchor=null;
 return {
  monotonic,
  get synced(){return anchor!==null},
  observe(serverDate,start,end=monotonic()){
   const server=Date.parse(String(serverDate||'')),elapsed=end-start;
   if(!Number.isFinite(server)||!Number.isFinite(elapsed)||elapsed<0||elapsed>5000)return false;
   // HTTP Date has one-second precision. Its upper bound plus half the RTT
   // stays within the existing 10-second guard without widening that guard.
   // Keep one immutable UTC/monotonic mapping per document/background lifetime.
   // Replacing it would also retime already captured instants in this context.
   if(!anchor)anchor={server:server+1000+elapsed/2,mono:end,uncertainty:1000+elapsed};return true;
  },
  now(){return anchor?anchor.server+monotonic()-anchor.mono:Date.now()},
  iso(){return new Date(this.now()).toISOString()},
  at(mono){return anchor?anchor.server+mono-anchor.mono:null},
  metadata(){return {method:anchor?'server_date_monotonic':'unsynchronized',uncertaintyMs:anchor?.uncertainty??null}}
 };
};
