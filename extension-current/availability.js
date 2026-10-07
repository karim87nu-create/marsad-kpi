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
