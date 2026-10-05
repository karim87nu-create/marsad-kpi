/* Marsad admin 3.6.8 loader */
(()=>{const files=['admin-shell-3.6.8.js','admin-derived-3.6.8.js','admin-access-3.6.8.js'];let i=0;const next=()=>{if(i>=files.length)return;const s=document.createElement('script');s.src=files[i++]+'?v=3.6.8';s.async=false;s.onload=next;s.onerror=()=>console.error('تعذر تحميل جزء من واجهة الإدارة',s.src);document.body.appendChild(s)};next()})();
