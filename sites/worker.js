// Cloudflare isolated transfer sandbox. NEVER connects to live Apex, Talabat, Telegram or Sites.
// All demo writes are limited to three fixed synthetic orders in a separate D1 table.
const examples = [
  { id: 'demo-site-101', source: 'الموقع', code: 'DEMO-101', branch: 'مدينة نصر', item: 'وجبة تجريبية', payment: 'كاش' },
  { id: 'demo-talabat-102', source: 'طلبات', code: 'DEMO-102', branch: 'التجمع', item: 'ساندويتش تجريبي', payment: 'مدفوع' },
  { id: 'demo-site-103', source: 'الموقع', code: 'DEMO-103', branch: 'مدينتي', item: 'طبق تجريبي', payment: 'كاش' }
];
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
const json = (data, status = 200) => Response.json(data, { status, headers });
const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>التحويلات - نسخة تجريبية</title><style>
body{font-family:system-ui,Tahoma,sans-serif;background:#f5f7fa;color:#17243b;max-width:850px;margin:30px auto;padding:16px}
h1{margin-bottom:5px}.note{background:#fff3d6;border:1px solid #f0d48a;padding:14px;border-radius:10px}
article{background:white;border:1px solid #dce2e9;border-radius:12px;margin:14px 0;padding:18px}
small{color:#566}button{background:#183e73;color:white;border:0;border-radius:7px;padding:10px 14px;margin:5px;cursor:pointer}
button:disabled{opacity:.4}.secondary{background:#52667e}.status{font-weight:700}#error{color:#b42318}
</style><h1>صفحة التحويلات — تجربة Cloudflare</h1>
<p class="note">بيانات تجريبية فقط. لا يوجد اتصال بـ Apex أو طلبات أو الموقع الأصلي أو تيليجرام. لا تستخدمها لتحويل أوردرات حقيقية.</p>
<p>اسم الموظف التجريبي: <input id="name" maxlength="40" placeholder="اكتب اسمًا تجريبيًا" autocomplete="off"></p>
<div id="error" role="alert"></div><div id="orders">جاري التحميل...</div>
<script>
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function refresh(){
 try{
 const r=await fetch('/api/demo-transfer/orders',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'فشل التحميل');
 $('orders').innerHTML=d.orders.map(o=>\`<article><b>\${esc(o.code)}</b> — \${esc(o.source)}<p>\${esc(o.branch)} | \${esc(o.item)} | \${esc(o.payment)}</p>
 <p class="status">الحالة: \${esc(o.state)} \${o.by?'— '+esc(o.by):''}</p>
 <button data-id="\${esc(o.id)}" data-action="claim" \${o.state!=='waiting'?'disabled':''}>استلام تجريبي</button>
 <button data-id="\${esc(o.id)}" data-action="entered" \${o.state!=='claimed'?'disabled':''}>تم التسجيل تجريبيًا</button>
 <button class="secondary" data-id="\${esc(o.id)}" data-action="reset">إعادة</button></article>\`).join('');
 }catch(e){$('error').textContent=e.message;}
}
$('orders').addEventListener('click',async e=>{
 const b=e.target.closest('button[data-action]');if(!b)return;
 const by=$('name').value.trim();if(!by){$('error').textContent='اكتب اسمًا تجريبيًا أولًا';return;}
 b.disabled=true;$('error').textContent='';
 try{const r=await fetch('/api/demo-transfer/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:b.dataset.id,action:b.dataset.action,by})});
 const d=await r.json();if(!r.ok)throw Error(d.error||'فشل الحفظ');await refresh();
 }catch(err){$('error').textContent=err.message;b.disabled=false;}
});refresh();
</script></html>`;
async function dbReady(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS transfer_demo_state (id TEXT PRIMARY KEY, state TEXT NOT NULL, by_name TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL)").run();
}
export default {
 async fetch(request, env) {
  const url = new URL(request.url), path = url.pathname;
  if (path === '/health' || path === '/api/health') return json({ ok: true, stage: 'cloudflare-migration', databaseConfigured: !!env.DB, demoTransfer: true, liveTransfers: false });
  if (path === '/api/transfer-demo' && request.method === 'GET') return new Response(html,{headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'"}});
  if (path === '/api/demo-transfer/orders' && request.method === 'GET') {
   if (!env.DB) return json({error:'staging_database_missing'},503);
   try {await dbReady(env.DB);const rows=await env.DB.prepare('SELECT id,state,by_name FROM transfer_demo_state').all();
    const states=new Map(rows.results.map(r=>[r.id,r]));
    return json({demo:true,orders:examples.map(o=>({...o,state:states.get(o.id)?.state||'waiting',by:states.get(o.id)?.by_name||''}))});
   } catch(e){console.error('demo-transfer read',e);return json({error:'demo_database_error'},500);}
  }
  if (path === '/api/demo-transfer/action' && request.method === 'POST') {
   if (!env.DB)return json({error:'staging_database_missing'},503);
   try{
    if (Number(request.headers.get('content-length')||0)>2048)return json({error:'payload_too_large'},413);
    const body=await request.json(),id=String(body.id||''),action=String(body.action||''),by=String(body.by||'').trim();
    if(!examples.some(o=>o.id===id)||!['claim','entered','reset'].includes(action)||!by||by.length>40)return json({error:'invalid_demo_action'},400);
    await dbReady(env.DB);
    if(action==='reset'){await env.DB.prepare('DELETE FROM transfer_demo_state WHERE id=?').bind(id).run();return json({ok:true,demo:true});}
    if(action==='claim'){
     const result=await env.DB.prepare("INSERT INTO transfer_demo_state(id,state,by_name,updated_at) VALUES (?,'claimed',?,?) ON CONFLICT(id) DO NOTHING").bind(id,by,Date.now()).run();
     return result.meta?.changes===1?json({ok:true,demo:true}):json({error:'already_claimed'},409);
    }
    const result=await env.DB.prepare("UPDATE transfer_demo_state SET state='entered',updated_at=? WHERE id=? AND state='claimed' AND by_name=?").bind(Date.now(),id,by).run();
    return result.meta?.changes===1?json({ok:true,demo:true}):json({error:'not_claimed_by_you'},409);
   }catch(e){console.error('demo-transfer write',e);return json({error:'demo_database_error'},500);}
  }
  // Isolated read-only mirror ingestion: writes to staging D1 only; no live integrations.
  if (path === '/api/mirror/ingest' && request.method === 'POST') {
   if (!env.DB || !env.MIRROR_INGEST_TOKEN) return json({error:'mirror_not_configured'},503);
   const provided=request.headers.get('x-mirror-token')||'';
   const a=new TextEncoder().encode(provided), b=new TextEncoder().encode(env.MIRROR_INGEST_TOKEN);
   if(a.length!==b.length || a.length<24)return json({error:'unauthorized'},401);
   let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
   if(diff)return json({error:'unauthorized'},401);
   const len=Number(request.headers.get('content-length')||0);
   if(len>262144)return json({error:'payload_too_large'},413);
   try {
    const reader=request.body?.getReader();if(!reader)return json({error:'empty_body'},400);
    const chunks=[];let size=0;
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>262144){await reader.cancel();return json({error:'payload_too_large'},413);}chunks.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    const data=JSON.parse(new TextDecoder().decode(bytes));
    const source=String(data?.source||''),ref=String(data?.ref||'');
    if(!['talabat','site','apex'].includes(source)||!ref||ref.length>100||typeof data.payload!=='object'||!data.payload||Array.isArray(data.payload))return json({error:'invalid_mirror_payload'},400);
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS mirror_ingest (source TEXT NOT NULL, ref TEXT NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(source,ref))").run();
    await env.DB.prepare("INSERT INTO mirror_ingest(source,ref,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(source,ref) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(source,ref,JSON.stringify(data.payload),Date.now()).run();
    return json({ok:true,staging:true,source,ref});
   }catch(e){console.error('mirror ingest',e);return json({error:'mirror_ingest_failed'},500);}
  }
  if(path==='/api/mirror/status' && request.method==='GET') {
   return json({configured:!!env.MIRROR_INGEST_TOKEN,databaseConfigured:!!env.DB,liveApexWrites:false,liveNotifications:false});
  }
  return json({error:'staging_locked'},403);
 }
};
