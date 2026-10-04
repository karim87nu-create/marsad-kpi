// Page-rendered controls avoid platform-native RTL popup painting problems.
(()=>{
 let opened=null;
 const close=()=>{if(!opened)return;opened.menu.hidden=true;opened.button.setAttribute("aria-expanded","false");opened=null};
 for(const select of document.querySelectorAll("select")){
  // A body-level popup cannot appear above a native dialog's top layer.
  // Keep its small, accessible status picker native inside the dialog.
  if(select.closest("dialog"))continue;
  const button=document.createElement("button"),menu=document.createElement("div"),search=document.createElement("input"),list=document.createElement("div");
  const label=Array.from(select.closest("label")?.childNodes||[]).filter(n=>n.nodeType===3).map(n=>n.textContent).join(" ").trim()||"اختر";
  button.type="button";button.className="select-button";button.id=select.id+"-button";
  button.setAttribute("role","combobox");button.setAttribute("aria-label",label);button.setAttribute("aria-expanded","false");button.setAttribute("aria-haspopup","listbox");
  menu.className="select-menu";menu.hidden=true;menu.dir="rtl";search.type="search";search.placeholder="ابحث في الاختيارات";search.setAttribute("aria-label","ابحث في "+label);
  list.id=select.id+"-options";list.setAttribute("role","listbox");list.setAttribute("aria-label",label);button.setAttribute("aria-controls",list.id);
  menu.append(search,list);document.body.append(menu);select.after(button);select.hidden=true;select.setAttribute("aria-hidden","true");select.tabIndex=-1;
  let options=[],focusIndex=0;
  const sync=()=>{button.textContent=(select.selectedOptions[0]?.textContent||"اختر")+" ▾";button.disabled=select.disabled;if(opened?.menu===menu)render()};
  const position=()=>{const rect=button.getBoundingClientRect(),width=Math.min(Math.max(rect.width,260),window.innerWidth-24);menu.style.width=width+"px";menu.style.left=Math.max(12,Math.min(rect.right-width,window.innerWidth-width-12))+"px";const below=window.innerHeight-rect.bottom-12,above=rect.top-12;menu.style.maxHeight=Math.max(140,Math.min(330,Math.max(below,above)))+"px";menu.style.top=(below>=Math.min(260,above)?rect.bottom+4:Math.max(12,rect.top-Math.min(330,above)))+"px"};
  const choose=option=>{if(option.disabled)return;select.value=option.value;sync();close();button.focus();select.dispatchEvent(new Event("input",{bubbles:true}));select.dispatchEvent(new Event("change",{bubbles:true}))};
  function render(){
   const q=search.value.trim().toLocaleLowerCase();options=Array.from(select.options).filter(o=>!o.hidden&&(!q||o.textContent.toLocaleLowerCase().includes(q)));list.replaceChildren();
   options.forEach((o,index)=>{const item=document.createElement("div");item.className="select-option";item.textContent=o.textContent;item.tabIndex=-1;item.setAttribute("role","option");item.setAttribute("aria-selected",String(o.selected));item.setAttribute("aria-disabled",String(o.disabled));item.onclick=()=>choose(o);item.onfocus=()=>{focusIndex=index};list.append(item)});
   if(!options.length){const empty=document.createElement("p");empty.textContent="لا توجد اختيارات مطابقة";list.append(empty)}
   focusIndex=Math.max(0,options.findIndex(o=>o.selected));
  }
  const open=()=>{close();search.value="";opened={menu,button};menu.hidden=false;button.setAttribute("aria-expanded","true");render();position();search.focus()};
  button.onclick=()=>opened?.menu===menu?close():open();
  function keyboard(e){
   if(e.key==="Escape"){close();button.focus();e.preventDefault();return}
   if(e.key==="Tab"){close();return}
   if(e.key==="ArrowDown"||e.key==="ArrowUp"||e.key==="Home"||e.key==="End"){
    e.preventDefault();if(opened?.menu!==menu){open();return}if(!options.length)return;
    if(e.target===search)focusIndex=e.key==="ArrowUp"?options.length-1:0;
    else focusIndex=e.key==="Home"?0:e.key==="End"?options.length-1:(focusIndex+(e.key==="ArrowUp"?-1:1)+options.length)%options.length;
    list.children[focusIndex]?.focus();list.children[focusIndex]?.scrollIntoView({block:"nearest"});
   }else if(e.key==="Enter"&&opened?.menu===menu&&e.target!==search){e.preventDefault();if(options[focusIndex])choose(options[focusIndex])}
  }
  button.addEventListener("keydown",keyboard);menu.addEventListener("keydown",keyboard);search.oninput=render;
  select.addEventListener("input",sync);select.addEventListener("change",sync);new MutationObserver(sync).observe(select,{childList:true,subtree:true,attributes:true,characterData:true});sync();
 }
 document.addEventListener("pointerdown",e=>{if(opened&&!opened.menu.contains(e.target)&&e.target!==opened.button)close()});
 window.addEventListener("resize",close);window.addEventListener("scroll",e=>{if(opened&&!opened.menu.contains(e.target))close()},true);
})();
