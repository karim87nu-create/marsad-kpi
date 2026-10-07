/* Keep disclosure elements and user choices alive while live data refreshes. */
(()=>{'use strict';
function render(root,groups){
 const doc=root.ownerDocument;
 for(const child of [...root.children])if(!child.dataset.liveGroup&&!child.dataset.liveEmpty)child.remove();
 for(const group of groups){
  let item=[...root.children].find(n=>n.dataset.liveGroup===group.key);
  if(!item){item=doc.createElement('details');item.dataset.liveGroup=group.key;item.className='employee-group state-'+group.key;const summary=doc.createElement('summary'),tiles=doc.createElement('div');tiles.className='employee-tiles';item.append(summary,tiles);root.appendChild(item);}
  item.hidden=!group.html;
  if(item.children[0].textContent!==group.label)item.children[0].textContent=group.label;
  const tiles=item.children[1];if(tiles.innerHTML!==group.html)tiles.innerHTML=group.html;
 }
 let empty=[...root.children].find(n=>n.dataset.liveEmpty);
 if(!empty){empty=doc.createElement('p');empty.dataset.liveEmpty='1';empty.className='empty-state';empty.textContent='لا يوجد موظفون مطابقون للاختيار الحالي.';root.appendChild(empty);}
 empty.hidden=groups.some(g=>!!g.html);
}
window.MarsadLiveGroups={render};
})();
