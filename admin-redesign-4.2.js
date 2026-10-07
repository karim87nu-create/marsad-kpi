/* Marsad Admin 4.2 — restructure visible page DOM only; preserve all IDs/data/events. */
(()=>{
  'use strict';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));

  function directChildren(section){return Array.from(section.children)}
  function isHead(node){return node.matches?.('h3')}
  function isSummaryNode(node){return node.matches?.('.cards,.pressure-grid')}
  function isPrimaryHead(node){return node.matches?.('.section-head') || node.matches?.('h2')}
  function isLead(node){return node.matches?.('p.muted')}

  function wrapSection(section){
    if(!section || section.dataset.mr42==='1') return;
    section.dataset.mr42='1';
    section.classList.add('mr42-page');

    const kids=directChildren(section);
    const keep=[];
    const summary=[];
    const blocks=[];
    let current=null;

    kids.forEach(node=>{
      if(isPrimaryHead(node) || (isLead(node) && !current && summary.length===0)){
        keep.push(node);return;
      }
      if(isHead(node)){
        current=[];blocks.push(current);current.push(node);return;
      }
      if(current){current.push(node);return}
      if(isSummaryNode(node) || node.id==='healthNote' || node.id==='profileNote' || node.id==='comparisonNote'){
        summary.push(node);return;
      }
      current=[];blocks.push(current);current.push(node);
    });

    const layout=document.createElement('div');layout.className='mr42-page-layout';
    if(summary.length){
      const box=document.createElement('div');box.className='mr42-summary';summary.forEach(n=>box.appendChild(n));layout.appendChild(box);
    }
    blocks.filter(b=>b.length).forEach(group=>{
      const box=document.createElement('div');box.className='mr42-block';group.forEach(n=>box.appendChild(n));layout.appendChild(box);
    });
    if(layout.childElementCount) section.appendChild(layout);
  }

  function repairContrast(root=document){
    $$('button',root).forEach(b=>{
      b.style.removeProperty('color');b.style.removeProperty('background');b.style.removeProperty('opacity');
    });
    $$('summary',root).forEach(s=>{
      s.style.removeProperty('color');s.style.removeProperty('background');s.style.removeProperty('opacity');
    });
  }

  function boot(){
    $$('section.view').forEach(wrapSection);
    repairContrast();
    new MutationObserver(muts=>{
      let need=false;
      muts.forEach(m=>{if(m.addedNodes?.length)need=true});
      if(need){$$('section.view').forEach(wrapSection);repairContrast()}
    }).observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
