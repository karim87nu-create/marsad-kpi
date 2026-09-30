(function () {
  if (!location.hostname.includes('41.38.207.218')) return;
  const API = 'https://marsad-kpi-live.karim87nu.chatgpt.site';
  const TOKEN = '7000865f1220458f86506b41a97cab7d';
  const SESSION_KEY = 'arabicss_kpi_employee_session';
  let employee = sessionStorage.getItem(SESSION_KEY) || '';
  let lastCall = null;
  let lastDuration = 0;

  function extensionNumber() {
    const title = document.querySelector('.issabel-callcenter-titulo-consola')?.textContent || '';
    return (title.match(/(?:IAX2|SIP)\/(\d+)/) || [])[1] || '';
  }

  function send(event) {
    return fetch(`${API}/api/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-token': TOKEN },
      body: JSON.stringify(event),
    }).catch(() => {});
  }

  function mountSessionBox() {
    if (document.getElementById('kpi-session-box')) return;
    const box = document.createElement('div');
    box.id = 'kpi-session-box';
    box.dir = 'rtl';
    box.style.cssText = 'position:fixed;z-index:2147483647;left:16px;bottom:16px;width:280px;background:#142033;color:#fff;border:1px solid #2dd4bf;border-radius:12px;padding:14px;font:14px Arial;box-shadow:0 8px 30px #0007';
    box.innerHTML = `
      <div style="font-weight:700;margin-bottom:9px">جلسة الموظف — KPI</div>
      <div id="kpi-session-active" style="display:none">
        <div>الموظف الحالي: <b id="kpi-employee-name"></b></div>
        <button id="kpi-end-shift" style="margin-top:10px;width:100%;padding:8px;border:0;border-radius:7px;cursor:pointer">إنهاء الشيفت</button>
      </div>
      <div id="kpi-session-form">
        <input id="kpi-employee-input" autocomplete="off" placeholder="اكتب اسم الموظف أو الكود" style="box-sizing:border-box;width:100%;padding:9px;border-radius:7px;border:1px solid #64748b">
        <button id="kpi-start-shift" style="margin-top:8px;width:100%;padding:9px;border:0;border-radius:7px;background:#2dd4bf;color:#07131f;font-weight:700;cursor:pointer">بدء الشيفت</button>
        <div id="kpi-session-error" style="color:#fda4af;margin-top:7px"></div>
      </div>`;
    document.body.appendChild(box);
    const render = () => {
      box.querySelector('#kpi-session-active').style.display = employee ? 'block' : 'none';
      box.querySelector('#kpi-session-form').style.display = employee ? 'none' : 'block';
      box.querySelector('#kpi-employee-name').textContent = employee;
    };
    box.querySelector('#kpi-start-shift').onclick = () => {
      const value = box.querySelector('#kpi-employee-input').value.trim();
      if (value.length < 2) {
        box.querySelector('#kpi-session-error').textContent = 'اكتب الاسم أو الكود أولاً';
        return;
      }
      employee = value;
      sessionStorage.setItem(SESSION_KEY, employee);
      render();
      scan();
    };
    box.querySelector('#kpi-end-shift').onclick = () => {
      if (lastCall) {
        alert('لا يمكن إنهاء أو تبديل الشيفت أثناء مكالمة جارية');
        return;
      }
      employee = '';
      sessionStorage.removeItem(SESSION_KEY);
      box.querySelector('#kpi-employee-input').value = '';
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
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true });
  scan();
})();

