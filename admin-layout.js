/* Marsad admin 4.3.0: fail-safe light UI. Business logic/data stays unchanged. */
(()=>{
  document.body.classList.add('marsad-redesign');
  ['admin-redesign-4.0.css?v=4.0.0','admin-safe-4.3.css?v=4.3.0'].forEach(href=>{const css=document.createElement('link');css.rel='stylesheet';css.href=href;document.head.appendChild(css)});
  const files=['admin-view-model-3.7.1.js','admin-shell-3.7.2.js','admin-derived-3.7.2.js','admin-profile-3.7.1.js','admin-access-3.7.1.js','admin-evidence-labels-3.7.5.js','admin-redesign-4.0.js'];
  let i=0;
  const next=()=>{if(i>=files.length)return;const s=document.createElement('script');const f=files[i++];s.src=f+'?v='+(f.includes('4.0')?'4.3.0':'3.7.5');s.async=false;s.onload=next;s.onerror=()=>{console.error('تعذر تحميل جزء من واجهة الإدارة',s.src);next()};document.body.appendChild(s)};
  next();
})();
