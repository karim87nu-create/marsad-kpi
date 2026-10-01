(function () {
  if (!location.hostname.includes('41.38.207.218')) return;
  const API = 'https://marsad-kpi-live.karim87nu.chatgpt.site';
  const TOKEN = '7000865f1220458f86506b41a97cab7d';
  const SESSION_KEY = 'arabicss_kpi_employee_session';
  let employee = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  let sessionToken = sessionStorage.getItem(SESSION_KEY + '_token') || '';
  let lastCall = null;
  let lastDuration = 0;
  let breakStarted = null;
  const queueKey='arabicss_kpi_offline_queue';

  const hook=document.createElement('script');hook.src=browser.runtime.getURL('page-hook.js');hook.onload=()=>hook.remove();(document.documentElement||document.head).appendChild(hook);

  function extensionNumber() {
    const title = document.querySelector('.issabel-callcenter-titulo-consola')?.textContent || '';
    return (title.match(/(?:IAX2|SIP)\/(\d+)/) || [])[1] || '';
  }

  async function enqueue(event){const q=(await browser.storage.local.get(queueKey))[queueKey]||[];q.push(event);await browser.storage.local.set({[queueKey]:q.slice(-2000)});}
  async function send(event) {
    try { const r=await fetch(`${API}/api/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-token': TOKEN, 'x-employee-session': sessionToken },
      body: JSON.stringify(event),
      keepalive:true,
    }); if(!r.ok)throw new Error('send'); return true } catch { await enqueue(event); return false }
  }
  async function flush(){if(!sessionToken)return;const q=(await browser.storage.local.get(queueKey))[queueKey]||[];if(!q.length)return;const left=[];for(const event of q){try{const r=await fetch(`${API}/api/events`,{method:'POST',headers:{'content-type':'application/json','x-device-token':TOKEN,'x-employee-session':sessionToken},body:JSON.stringify(event)});if(!r.ok)left.push(event)}catch{left.push(event)}}await browser.storage.local.set({[queueKey]:left})}
  function activity(eventType,extra={}){const at=new Date().toISOString();return send({eventType,eventKey:`${extensionNumber()}:${employee?.id||'none'}:${eventType}:${at}`,extension:extensionNumber(),occurredAt:at,...extra})}

  function mountSessionBox() {
    if (document.getElementById('kpi-session-box')) return;
    const box = document.createElement('div');
    box.id = 'kpi-session-box';
    box.dir = 'rtl';
    box.style.cssText = 'position:fixed;z-index:2147483647;background:#142033;color:#fff;border:1px solid #2dd4bf;padding:18px;font:14px Arial;box-shadow:0 8px 30px #0009';
    box.innerHTML = `
      <div style="font-weight:700;margin-bottom:9px">جلسة الموظف — KPI</div>
      <div id="kpi-session-active" style="display:none">
        <div>الموظف الحالي: <b id="kpi-employee-name"></b></div>
        <button id="kpi-end-shift" style="margin-top:10px;width:100%;padding:8px;border:0;border-radius:7px;cursor:pointer">إنهاء الشيفت</button>
      </div>
      <div id="kpi-session-form">
        <select id="kpi-employee-input" style="box-sizing:border-box;width:100%;padding:9px;border-radius:7px;border:1px solid #64748b"><option value="">اختر اسم الموظف</option></select>
        <input id="kpi-pin-input" type="password" inputmode="numeric" maxlength="8" placeholder="PIN الشخصي" style="box-sizing:border-box;width:100%;padding:9px;margin-top:8px;border-radius:7px;border:1px solid #64748b">
        <button id="kpi-start-shift" style="margin-top:8px;width:100%;padding:9px;border:0;border-radius:7px;background:#2dd4bf;color:#07131f;font-weight:700;cursor:pointer">بدء الشيفت</button>
        <div id="kpi-session-error" style="color:#fda4af;margin-top:7px"></div>
      </div>`;
    document.body.appendChild(box);
    const render = () => {
      box.querySelector('#kpi-session-active').style.display = employee ? 'block' : 'none';
      box.querySelector('#kpi-session-form').style.display = employee ? 'none' : 'block';
      box.querySelector('#kpi-employee-name').textContent = employee?.name || '';
      box.style.cssText = 'position:fixed;z-index:2147483647;color:#fff;border:1px solid #2dd4bf;padding:18px;font:14px Arial;box-shadow:0 8px 30px #0009;' + (employee?'left:16px;bottom:16px;width:280px;border-radius:12px;background:#142033':'inset:0;display:grid;place-content:center;text-align:center;background:#07111ff2');
    };
    fetch(`${API}/api/employees/list`).then(r=>r.json()).then(d=>{box.querySelector('#kpi-employee-input').innerHTML='<option value="">اختر اسم الموظف</option>'+d.employees.map(e=>`<option value="${e.id}">${e.name}</option>`).join('')}).catch(()=>{});
    box.querySelector('#kpi-start-shift').onclick = async () => {
      const employeeId = Number(box.querySelector('#kpi-employee-input').value);
      const pin = box.querySelector('#kpi-pin-input').value;
      if (!employeeId || !/^\d{4,8}$/.test(pin)) { box.querySelector('#kpi-session-error').textContent = 'اختر اسمك وأدخل PIN الصحيح'; return; }
      const r=await fetch(`${API}/api/session/start`,{method:'POST',headers:{'content-type':'application/json','x-device-token':TOKEN},body:JSON.stringify({employeeId,pin,extension:extensionNumber()})});
      if(!r.ok){box.querySelector('#kpi-session-error').textContent='الـPIN غير صحيح';return}
      const data=await r.json();employee=data.employee;sessionToken=data.token;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(employee));sessionStorage.setItem(SESSION_KEY+'_token',sessionToken);
      box.querySelector('#kpi-pin-input').value='';render();await activity('session_login',{state:'verified'});flush();scan();
    };
    box.querySelector('#kpi-end-shift').onclick = () => {
      if (lastCall) {
        alert('لا يمكن إنهاء أو تبديل الشيفت أثناء مكالمة جارية');
        return;
      }
      activity('session_logout',{state:'manual'});employee = '';
      sessionStorage.removeItem(SESSION_KEY);
      sessionToken='';sessionStorage.removeItem(SESSION_KEY+'_token');box.querySelector('#kpi-employee-input').value = '';
      render();
    };
    render();
  }

  function scan() {
    if (!employee) return;
    const extension = extensionNumber();
    if (!extension) return;
    const state = document.querySelector('#issabel-callcenter-estado-agente-texto')?.textContent?.trim() || '';
    const info = document.querySelector('#issabel-callcenter-llamada-info')?.innerText || '';
    const callId = (info.match(/Internal Call ID:\s*([^\s]+)/i) || [])[1];
    const phone = (info.match(/Phone number:\s*([+\d]+)/i) || [])[1];
    const duration = document.querySelector('#issabel-callcenter-cronometro')?.textContent || '00:00:00';
    const seconds = duration.split(':').reduce((total, value) => total * 60 + Number(value || 0), 0);
    if (callId) lastDuration = seconds;
    if (callId && callId !== lastCall) {
      lastCall = callId;
      lastDuration = 0;
      send({ eventType: 'agentlinked', eventKey: `${extension}:${callId}:start`, callId, agentName: employee, extension, phone, callType: callId.startsWith('incoming') ? 'incoming' : 'outgoing', occurredAt: new Date().toISOString(), durationSeconds: 0, state });
    }
    if (lastCall && !callId) {
      send({ eventType: 'agentunlinked', eventKey: `${extension}:${lastCall}:end`, callId: lastCall, agentName: employee, extension, occurredAt: new Date().toISOString(), durationSeconds: lastDuration, state });
      lastCall = null;
      lastDuration = 0;
    }
  }

  mountSessionBox();
  window.addEventListener('message',e=>{if(e.origin!==location.origin||e.data?.source!=='ARABICSS_KPI_SSE'||!employee)return;let payload={};try{payload=JSON.parse(e.data.data||'{}')}catch{};if(e.data.type==='breakenter'){breakStarted=new Date().toISOString();activity('break_start',{state:String(payload.breakname||payload.break||'Break'),payload})}if(e.data.type==='breakexit'){const seconds=breakStarted?Math.round((Date.now()-new Date(breakStarted).getTime())/1000):0;activity('break_end',{durationSeconds:seconds,state:'Available',payload});breakStarted=null}if(e.data.type==='agentloggedout')activity('arabicss_logout',{payload});if(e.data.type==='agentloggedin')activity('arabicss_login',{payload})});
  window.addEventListener('online',flush);setInterval(flush,10000);
  window.addEventListener('pagehide',()=>{if(employee)activity('page_closed',{state:'unexpected_or_navigation'})});
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true });
  scan();
})();

