/* Marsad admin experience 3.7.0 placement fix */
(()=>{const p=document.getElementById('profile'),cards=document.getElementById('profileCards'),ops=p?.querySelector('.profile-ops-summary'),timeline=p?.querySelector('.employee-timeline-panel');if(!p||!cards||!ops||!timeline)return;cards.insertAdjacentElement('afterend',ops);ops.insertAdjacentElement('afterend',timeline)})();
