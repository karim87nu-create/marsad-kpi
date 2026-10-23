let messagePollBusy=false;
async function pollAdminMessages(){
 if(messagePollBusy)return;messagePollBusy=true;
 try{
  await startupCleanup;
  const entries=(await browser.storage.local.get(TAB_SESSIONS))[TAB_SESSIONS]||{};
  for(const [tab,entry] of Object.entries(entries)){
   if(entry.pendingClose||!/^\d+$/.test(String(entry.state?.extension||'')))continue;
   const headers={'content-type':'application/json','x-device-token':entry.deviceToken,'x-employee-session':entry.token};
   const r=await request(API+'/api/messages',{headers});if(!r.ok)continue;const d=await r.json();
   const pendingReceipt=d.messages.find(m=>(entry.messageKeys||[]).includes(m.id)&&!m.delivered_at);
   if(pendingReceipt){await request(API+'/api/messages',{method:'PATCH',headers,body:JSON.stringify({id:pendingReceipt.id,action:'delivered'})});continue}
   // One notification at a time avoids Firefox dropping rapid notification bursts.
   const m=d.messages.find(m=>!(entry.messageKeys||[]).includes(m.id));if(!m)continue;
   const displayed=await withQueueLock(async()=>{
    const current=(await browser.storage.local.get(TAB_SESSIONS))[TAB_SESSIONS]||{},owner=current[tab];
    if(!owner||owner.pendingClose||owner.token!==entry.token||(owner.messageKeys||[]).includes(m.id))return false;
    await browser.notifications.create('admin-message-'+tab,{type:'basic',iconUrl:browser.runtime.getURL('notification.svg'),title:(m.priority==='urgent'?'عاجل — ':'')+m.title,message:m.message.slice(0,500)});
    owner.messageKeys=[...(owner.messageKeys||[]),m.id].slice(-200);await browser.storage.local.set({[TAB_SESSIONS]:current});return true;
   });
   if(displayed)await request(API+'/api/messages',{method:'PATCH',headers,body:JSON.stringify({id:m.id,action:'delivered'})});
  }
 }catch{}finally{messagePollBusy=false}
}
setInterval(pollAdminMessages,10000);
