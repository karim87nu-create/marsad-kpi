/* Marsad admin 4.2.0: versioned assets + page-first redesign. Business logic/data stays unchanged. */
(()=>{
  ['admin-redesign-4.0.css?v=4.0.0','admin-redesign-4.1.css?v=4.1.0','admin-redesign-4.2.css?v=4.2.0'].forEach(href=>{const css=document.createElement('link');css.rel='stylesheet';css.href=href;document.head.appendChild(css)});
  const files=['admin-view-model-3.7.1.js','admin-shell-3.7.2.js','admin-derived-3.7.2.js','admin-profile-3.7.1.js','admin-access-3.7.1.js','admin-evidence-labels-3.7.5.js','admin-redesign-4.0.js','admin-redesign-4.1.js','admin-redesign-4.2.js'];
  let i=0;
  const next=()=>{if(i>=files.length)return;const s=document.createElement('script');const f=files[i++];const v=f.includes('4.2')?'4.2.0':(f.includes('4.1')?'4.1.0':(f.includes('4.0')?'4.0.0':'3.7.5'));s.src=f+'?v='+v;s.async=false;s.onload=next;s.onerror=()=>console.error('تعذر تحميل جزء من واجهة الإدارة',s.src);document.body.appendChild(s)};
  next();
})();
