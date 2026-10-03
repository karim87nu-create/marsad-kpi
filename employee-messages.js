(function(){
 let busy=false,acknowledging=0,owner='',box=null;
 const identity=()=>globalThis.kpiMessageIdentity?.();
 async function api(who,method='GET',body){const r=await browser.runtime.sendMessage({type:'KPI_API',path:'/api/messages',method,headers:{'content-type':'application/json','x-device-token':who.deviceToken,'x-employee-session':who.token},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error('لم يتم حفظ التأكيد؛ حاول مرة أخرى');return JSON.parse(r.body)}
 function clear(){box?.remove();box=null;owner=''}
 async function poll(){
  const who=identity();if(!who){clear();return}if(owner&&owner!==who.token)clear();if(busy||acknowledging)return;busy=true;
  try{
   const d=await api(who);if(identity()?.token!==who.token)return;
   owner=who.token;box?.remove();box=null;if(!d.messages.length)return;
   box=document.createElement('section');box.dir='rtl';box.setAttribute('aria-label','رسائل الإدارة');box.style.cssText='position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(360px,90vw);max-height:65vh;overflow:auto;background:#0b1929;color:white;border:2px solid #2dd4bf;border-radius:12px;padding:14px;font:16px Arial;box-sizing:border-box';
   for(const m of d.messages){
    const card=document.createElement('article');card.style.cssText='padding:12px;margin-bottom:10px;border:1px solid '+(m.priority==='urgent'?'#fbbf24':'#64748b')+';border-radius:8px';
    const title=document.createElement('strong');title.textContent=(m.priority==='urgent'?'عاجل — ':'')+m.title;
    const text=document.createElement('p');text.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5';text.textContent=m.message;
    const button=document.createElement('button');button.textContent='تم الاطلاع';button.style.cssText='background:#2dd4bf;color:#06251e;border:0;padding:10px;border-radius:6px;font:700 16px Arial;cursor:pointer';
    button.onclick=async()=>{if(identity()?.token!==who.token){clear();return}button.disabled=true;acknowledging++;try{await api(who,'PATCH',{id:m.id,action:'acknowledged'});card.remove();if(!box?.children.length)clear()}catch(e){button.textContent=e.message;button.disabled=false}finally{acknowledging--}};
    card.append(title,text,button);box.appendChild(card);
   }
   document.body.appendChild(box);
   // Delivery means rendered, not read; only the button records acknowledgment.
   for(const m of d.messages)if(!m.delivered_at&&identity()?.token===who.token)await api(who,'PATCH',{id:m.id,action:'delivered'});
  }catch{}finally{busy=false}
 }
 setInterval(poll,10000);setInterval(()=>{if(!identity()||owner&&identity()?.token!==owner)clear()},1000);
 window.addEventListener('focus',poll);window.addEventListener('online',poll);poll();
})();

