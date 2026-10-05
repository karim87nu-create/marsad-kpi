/* Read-only administration presentation helpers. No KPI or attribution mutation. */
(()=>{'use strict';
const number=v=>v==null?null:Number.isFinite(Number(v))?Number(v):null;
const ms=v=>typeof v==='number'?v:Date.parse(v||'');
const name=(id,staff)=>staff.find(e=>Number(e.id)===Number(id))?.name||'اسم الموظف غير متاح';
const labels={ready:'متاح',on_call:'في مكالمة',break:'بريك',unknown:'انقطاع رصد',logged_in:'دخل النظام ولم يبدأ استقبال المكالمات',post_call:'انتهت المكالمة — في انتظار تأكيد الإتاحة',offline:'خروج مسجل',shift_ended:'خلص الشيفت',break_unconfirmed:'بريك لم تصل بدايته أو نهايته'};
function profile(data,id,extension=''){
 const match=r=>Number(r.employeeId)===Number(id)&&(!extension||String(r.extension||'')===extension);
 const sessions=[...new Map((data.sessions||[]).filter(match).map(s=>[(s.id||s.issuedAt)+'|'+s.extension+'|'+s.startedAt,s])).values()].sort((a,b)=>ms(a.issuedAt||a.startedAt)-ms(b.issuedAt||b.startedAt));
 const states=(data.states||[]).filter(match).sort((a,b)=>ms(a.startedAt)-ms(b.startedAt)),events=[],seen=new Set();
 const add=(time,label,ext,duration,kind,key)=>{const t=ms(time);if(!Number.isFinite(t))return;const k=key||[t,label,ext].join('|');if(seen.has(k))return;seen.add(k);events.push({time:new Date(t).toISOString(),label,extension:ext||'—',duration,kind});};
 for(const s of sessions){add(s.issuedAt||s.startedAt,'دخول النظام',s.extension,null,'login','login|'+s.id+'|'+s.extension);if(s.revokedAt)add(s.revokedAt,'خروج مسجل',s.extension,null,'logout','logout|'+s.id);}
 for(const s of states)add(s.startedAt,labels[s.state]||'حالة مسجلة',s.extension,number(s.durationSeconds),s.state);
 const links=(data.timeline||[]).filter(match).filter(e=>['session_login','extension_changed'].includes(e.eventType)&&/^\d+$/.test(String(e.extension||''))).map(e=>({time:e.occurredAt,extension:e.extension}));
 for(const s of sessions)if(s.extension)links.push({time:s.workStartedAt||s.startedAt||s.issuedAt,extension:s.extension});
 const recordedExtensions=new Set([...links.map(x=>String(x.extension)),...states.map(s=>String(s.extension||''))].filter(x=>/^\d+$/.test(x)));
 links.sort((a,b)=>ms(a.time)-ms(b.time));let previous='',changes=0;
 for(const link of links){if(!/^\d+$/.test(String(link.extension||'')))continue;if(previous&&previous!==link.extension){changes++;add(link.time,'تغيير التحويلة: '+previous+' ← '+link.extension,link.extension,null,'extension');}previous=link.extension;}
 const overlaps=[];for(let i=0;i<sessions.length;i++)for(let j=i+1;j<sessions.length;j++){const a=sessions[i],b=sessions[j];if(a.id===b.id)continue;const start=Math.max(ms(a.startedAt||a.issuedAt),ms(b.startedAt||b.issuedAt)),end=Math.min(ms(a.revokedAt||a.observedThrough||a.endedAt),ms(b.revokedAt||b.observedThrough||b.endedAt));if(Number.isFinite(end)&&end>start)overlaps.push({start:new Date(start).toISOString(),end:new Date(end).toISOString(),seconds:Math.floor((end-start)/1000),extensions:[a.extension,b.extension].join(' / ')});}
 const unavailable=states.filter(s=>['unknown','offline','break_unconfirmed'].includes(s.state));
 return{events:events.sort((a,b)=>ms(a.time)-ms(b.time)),changes,extensions:recordedExtensions.size,overlaps,unavailable,breaks:states.filter(s=>s.state==='break')};
}
function interventions({presence=[],records=[],staff=[],operations=null,now=Date.now(),fresh=false,queueFresh=false}){
 const out=[],add=(priority,key,title,detail,employeeId=null,view='profile')=>out.push({priority,key,title,detail,employeeId,view});
 if(!fresh)add(0,'stale-staff','تحديث حالات الموظفين متوقف','الحالات الحالية غير متاحة؛ راجع النظام والأجهزة.',null,'health');
 if(!queueFresh)add(0,'stale-waiting','تحديث انتظار العملاء متوقف','لا يمكن تأكيد عدد المنتظرين الآن.',null,'health');
 if(queueFresh)for(const [i,r]of records.entries()){const wait=/^\d+:[0-5]\d:[0-5]\d$/.test(String(r[8]))?String(r[8]).split(':').reduce((n,p)=>n*60+ +p,0):null;if(/^on wait$|^waiting$/i.test(String(r[10]).trim())&&wait>7)add(1,'wait:'+i,'عميل ينتظر أكثر من 7 ثوانٍ','وقت الانتظار: '+r[8],null,'live');}
 for(const p of presence){const who=name(p.employeeId,staff),duration=p.startedAt?Math.max(0,(now-ms(p.startedAt))/1000):null,state=p.displayState||p.state;
 if(state==='unknown')add(2,'disconnect:'+p.employeeId,'توقف تحديث حالة '+who,'آخر تحديث: '+(p.evidenceAt||'غير متاح'),p.employeeId);
 if(fresh&&state==='break'&&duration>=900)add(1,'break:'+p.employeeId,who+' تجاوز 15 دقيقة بريك','المدة: '+Math.floor(duration/60)+' دقيقة',p.employeeId);
 if(fresh&&['logged_in','ready'].includes(state)&&!/^\d+$/.test(String(p.extension||'')))add(3,'no-extension:'+p.employeeId,who+' دخل بدون تحويلة','لم يبدأ استقبال المكالمات على تحويلة مسجلة.',p.employeeId);
 if(fresh&&state==='on_call'&&duration>240)add(3,'call:'+p.employeeId,'مكالمة '+who+' تجاوزت 4 دقائق','المدة: '+Math.floor(duration/60)+' دقيقة',p.employeeId);
 }
 if(operations){const unresolved=(operations.attribution?.rows||[]).filter(r=>!r.included&&!['already_observed','not_answered'].includes(r.reason));if(unresolved.length)add(4,'unattributed','مكالمات لم يُحدد موظفها وتحتاج مراجعة','عدد الصفوف المتاحة للمراجعة: '+unresolved.length,null,'unattributed');
 for(const r of operations.reviews||[])if(['new','working'].includes(r.status))add(4,'review:'+r.id,r.title,r.owner?'مسؤول المتابعة: '+r.owner:'لم يُحدد مسؤول متابعة',r.employeeId,'followup');
 }
 return out.sort((a,b)=>a.priority-b.priority||a.key.localeCompare(b.key));
}
function filterPolicy(view){
 if(['settings','adminUsers','audit','health','guide','telegram'].includes(view))return[];
 if(['live','intervention'].includes(view))return['employee','state'];
 if(['queue','analysis'].includes(view))return['date','queue'];
 if(['metrics','profile','attendance','shifts'].includes(view))return['date','employee','extension'];
 if(['calls','missed','unattributed','customers'].includes(view))return['date','employee','queue'];
 return['date','employee'];
}
window.MarsadAdminViewModel={profile,interventions,filterPolicy,labels};
})();
