(function(){
  'use strict';
  window.lucide?.createIcons();
  if(document.getElementById('pageTheme')){
    const pagePath=location.pathname.replace(/\.html$/,'');
    for(const link of document.querySelectorAll('.page-header nav>a'))if(new URL(link.href).pathname.replace(/\.html$/,'')===pagePath)link.setAttribute('aria-current','page');
    if(pagePath==='/classifica')document.querySelector('.classifica-menu summary')?.setAttribute('aria-current','page');
  }
  const theme=document.getElementById('pageTheme');
  if(theme){
    try{document.body.classList.toggle('light',localStorage.getItem('icv-theme')==='light');}catch{}
    const sync=()=>{const light=document.body.classList.contains('light');theme.setAttribute('aria-pressed',String(light));theme.setAttribute('title',light?'Attiva tema scuro':'Attiva tema chiaro');const color=document.getElementById('themeColor');if(color)color.setAttribute('content',light?'#f5f5f2':'#070708');};
    sync();theme.addEventListener('click',()=>{document.body.classList.toggle('light');try{localStorage.setItem('icv-theme',document.body.classList.contains('light')?'light':'dark');}catch{}sync();});
  }
  for(const menu of document.querySelectorAll('.classifica-menu')){
    document.addEventListener('click',event=>{if(!menu.contains(event.target))menu.open=false;});
    menu.addEventListener('keydown',event=>{if(event.key==='Escape' && menu.open){menu.open=false;menu.querySelector('summary').focus();}});
  }
  const stylesheet=document.createElement('link');
  stylesheet.rel='stylesheet';
  stylesheet.href='/assets/pill-navigation.css?v=20261004-1';
  document.head.append(stylesheet);
  for(const nav of document.querySelectorAll('header>nav,.page-header nav')){
    nav.classList.add('icv-pill-nav');
    nav.setAttribute('aria-label','Menu principale');
    const items=[...nav.querySelectorAll(':scope>a,:scope>button,:scope>details>summary')];
    const indicator=document.createElement('span');
    indicator.className='icv-pill-indicator';
    indicator.setAttribute('aria-hidden','true');
    nav.prepend(indicator);
    let hovered=null;
    const current=()=>items.find(item=>item.matches('[aria-current="page"],.active'));
    const move=(item,instant=false)=>{
      if(instant)nav.setAttribute('data-instant','');
      else nav.removeAttribute('data-instant');
      items.forEach(candidate=>{
        if(candidate.classList.contains('icv-pill-target')!==(candidate===item))candidate.classList.toggle('icv-pill-target',candidate===item);
      });
      if(!item){indicator.style.opacity='0';return;}
      const bounds=item.getBoundingClientRect(),parent=nav.getBoundingClientRect();
      indicator.style.height=bounds.height+'px';
      indicator.style.width=bounds.width+'px';
      indicator.style.transform='translateX('+(bounds.left-parent.left+nav.scrollLeft-nav.clientLeft)+'px)';
      indicator.style.opacity='1';
    };
    nav.addEventListener('pointerover',event=>{
      if(!matchMedia('(hover:hover) and (pointer:fine)').matches)return;
      const item=items.find(candidate=>candidate.contains(event.target));
      if(item){hovered=item;move(item);}
    });
    nav.addEventListener('pointerleave',()=>{hovered=null;move(current());});
    nav.addEventListener('keydown',()=>{hovered=null;move(current(),true);});
    nav.addEventListener('click',()=>{hovered=null;move(current());});
    const refresh=()=>{
      const item=hovered||current();
      if(item&&nav.scrollWidth>nav.clientWidth){
        const bounds=item.getBoundingClientRect(),parent=nav.getBoundingClientRect();
        if(bounds.right>parent.right||bounds.left<parent.left)nav.scrollLeft+=bounds.left-parent.left-5;
      }
      move(item,true);
    };
    new ResizeObserver(refresh).observe(nav);
    let selected=current();
    new MutationObserver(()=>{
      if(current()!==selected){selected=current();move(selected);}
    }).observe(nav,{subtree:true,attributes:true,attributeFilter:['aria-current','class']});
    stylesheet.addEventListener('load',refresh);
    document.fonts?.ready.then(refresh);
    refresh();
  }
})();
