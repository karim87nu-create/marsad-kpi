/* Marsad admin 4.0.0: versioned assets + professional UI shell. Business logic/data stays unchanged. */
(()=>{
  const css=document.createElement('link');
  css.rel='stylesheet';css.href='admin-redesign-4.0.css?v=4.0.0';document.head.appendChild(css);
  const files=['admin-view-model-3.7.1.js','admin-shell-3.7.2.js','admin-derived-3.7.2.js','admin-profile-3.7.1.js','admin-access-3.7.1.js','admin-evidence-labels-3.7.5.js','admin-redesign-4.0.js'];
  let i=0;
  const next=()=>{if(i>=files.length)return;const s=document.createElement('script');const f=files[i++];s.src=f+'?v='+(f==='admin-redesign-4.0.js'?'4.0.0':'3.7.5');s.async=false;s.onload=next;s.onerror=()=>console.error('تعذر تحميل جزء من واجهة الإدارة',s.src);document.body.appendChild(s)};
  next();
})();
