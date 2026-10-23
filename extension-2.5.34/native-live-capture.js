// Native snapshots are evidence, never fabricated call or employee events.
globalThis.createNativeLiveCapture=({clock,ensureClock,config,epoch,storage,locked,post,onStatus})=>{
 const KEY='kpi_native_live_outbox',uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
 let flight=null,lastSeen=-Infinity,lastQueued=-Infinity,lastSignature='',seenEpoch=-1,retryAt=0,failures=0,pending=true;
 let acknowledgedUntil=-Infinity,acknowledgedEpoch=-1,knownSignature='',acknowledgedSignature='';
 const preparing=new Set();
 const pages=new Map(),owner=c=>String(c.refreshToken||c.token||'').split('.')[0];
 const signature=rows=>JSON.stringify(rows.map(r=>r.filter((_,i)=>i!==6&&i!==8)).map(r=>JSON.stringify(r)).sort());
 async function flush(){
  if(flight)return{ok:true,pending:true};if(clock.monotonic()<retryAt)return{ok:false,pending:true};
  const runEpoch=epoch();
  flight=(async()=>{try{
   const cfg=await config();if(!cfg?.enabled)return{ok:false};const who=owner(cfg);
   for(let step=0;step<8;step++){
    const current=await config();if(runEpoch!==epoch()||!current?.enabled||owner(current)!==who)return{ok:false};
    const entry=await locked(async()=>{const first=((await storage.get(KEY))[KEY]||[]).find(e=>e.owner===who);if(!first)pending=false;return first});if(!entry)break;
    if(preparing.has(entry.capture.id))break;
    let reply;try{reply=await post({action:'live',rows:entry.rows,capture:entry.capture})}catch(error){
     if(error.status!==400||!['invalid_capture_time','invalid_capture','invalid_live_snapshot'].includes(error.code))throw error;
     // Quarantine permanent invalid evidence durably before freeing its slot.
     // Authentication/rate-limit/server failures remain retryable.
     await locked(async()=>{const q=(await storage.get(KEY))[KEY]||[];const rejected=q.find(e=>e.owner===who&&e.capture.id===entry.capture.id);if(!rejected)return;await storage.set({['kpi_native_rejected_'+entry.capture.id]:{...rejected,rejection:error.code},[KEY]:q.filter(e=>e!==rejected)})});
     onStatus({liveError:'حُفظت لقطة مرفوضة للمراجعة؛ جارٍ إرسال اللقطات التالية'});continue;
    }
    if(reply?.ok!==true)throw Error('لم يصل تأكيد حفظ لقطة اللايف');
    if(runEpoch!==epoch())return{ok:false};
    await locked(async()=>{const q=(await storage.get(KEY))[KEY]||[];await storage.set({[KEY]:q.filter(e=>e.capture.id!==entry.capture.id||e.owner!==who)})});
    const mono=clock.monotonic(),serverNow=clock.synced?clock.at(mono):null,observed=Date.parse(reply.observedAt||''),age=serverNow===null?Infinity:serverNow-observed;
    const accepted=reply.liveAccepted===true&&reply.captureId===entry.capture.id&&entry.capture.timeBasis==='server-clock-v1'&&Number.isFinite(age)&&age>=-5000&&age<15000;
    if(accepted){
     // Expire from the evidence timestamp, not the arrival time of a late ACK.
     acknowledgedUntil=mono+15000-Math.max(0,age);acknowledgedEpoch=runEpoch;acknowledgedSignature=signature(entry.rows);
     onStatus({lastLive:reply.observedAt,liveError:null});
    }else onStatus({liveError:reply.archived?'اللقطة محفوظة كسجل فقط وليست لايف حديثًا؛ السحب الاحتياطي متاح':reply.duplicate||reply.liveReason==='superseded'?'وصلت لقطة مكررة أو أقدم؛ لم تُجدد اللايف':'لم يؤكد السيرفر اعتماد لقطة حديثة؛ السحب الاحتياطي متاح'});
   }
   failures=0;retryAt=0;return{ok:true};
  }catch(e){failures++;retryAt=clock.monotonic()+Math.min(30000,1000*2**Math.min(failures,5));onStatus({liveError:'لقطات اللايف محفوظة لإعادة الإرسال: '+(e.message||'تعذر الاتصال')});return{ok:false,error:e.message}}})();
  try{return await flight}finally{flight=null}
 }
 return {
  fresh(){return acknowledgedSignature===knownSignature&&acknowledgedEpoch===epoch()&&seenEpoch===epoch()&&clock.monotonic()-lastSeen<15000&&clock.monotonic()<acknowledgedUntil},flush,
  async ingest(rows,{pageId,sequence,tabId,waitForDelivery=true}){
   if(!uuid.test(pageId)||!Number.isSafeInteger(sequence)||sequence<1)return{ok:false,error:'invalid_native_sequence'};
   const runEpoch=epoch(),cfg=await config();if(!cfg?.enabled)return{ok:false};
   if(seenEpoch!==runEpoch){pages.clear();lastSignature='';lastQueued=-Infinity;lastSeen=-Infinity;acknowledgedUntil=-Infinity;acknowledgedEpoch=-1;retryAt=0;failures=0;seenEpoch=runEpoch}
   const key=String(tabId)+':'+pageId,previous=pages.get(key)||0;if(sequence<=previous)return{ok:true,obsolete:true};
   pages.delete(key);pages.set(key,sequence);while(pages.size>64)pages.delete(pages.keys().next().value);
   const mono=clock.monotonic(),wall=new Date().toISOString(),next=signature(rows),changed=next!==lastSignature;
   knownSignature=next;
   if(!changed&&mono-lastQueued<10000){lastSeen=mono;seenEpoch=runEpoch;if(!pending)return{ok:true,unchanged:true};if(!waitForDelivery){flush().catch(()=>{});return{ok:true,pending:true}}return flush()}
   // A successful clock sample may back-project to this capture instant, but
   // a stored unsynchronized snapshot is never retimed after a restart.
   const observed=clock.synced?clock.at(mono):null;
   const capture={id:crypto.randomUUID(),kind:'native_report_snapshot',pageId,sequence,changed,observedAt:observed===null?null:new Date(observed).toISOString(),originalObservedAt:wall,timeBasis:observed===null?'unverified':'server-clock-v1',uncertaintyMs:clock.metadata().uncertaintyMs};
   preparing.add(capture.id);
   try{
    await locked(async()=>{
     const current=await config();if(runEpoch!==epoch()||!current?.enabled||owner(current)!==owner(cfg))throw Error('collector_changed');
     const q=(await storage.get(KEY))[KEY]||[],entry={owner:owner(cfg),rows,capture};
     const own=q.filter(e=>e.owner===entry.owner);
     if(own.length>=256||JSON.stringify(own).length+JSON.stringify(entry).length>4000000)throw Error('امتلأ حفظ لقطات اللايف؛ يلزم مراجعة الاتصال');
     await storage.set({[KEY]:[...q,entry]});
     pending=true;
    });
    if(mono>=lastSeen&&knownSignature===next){lastSeen=mono;lastSignature=next;lastQueued=mono}
    if(observed===null){await ensureClock();if(clock.synced&&runEpoch===epoch()){
     const resolved={...capture,observedAt:new Date(clock.at(mono)).toISOString(),timeBasis:'server-clock-v1',uncertaintyMs:clock.metadata().uncertaintyMs};
     await locked(async()=>{const q=(await storage.get(KEY))[KEY]||[];await storage.set({[KEY]:q.map(e=>e.capture.id===capture.id&&e.owner===owner(cfg)?{...e,capture:resolved}:e)})});
    }}
   }catch(e){onStatus({liveError:e.message||'تعذر حفظ لقطة اللايف'});return{ok:false,error:e.message}}finally{preparing.delete(capture.id)}
   if(runEpoch!==epoch())return{ok:false};
   if(mono>=lastSeen&&knownSignature===next){lastSeen=mono;seenEpoch=runEpoch;lastSignature=next;lastQueued=mono}
   if(!waitForDelivery){flush().catch(()=>{});return{ok:true,pending:true}}return flush();
  },
 };
};
