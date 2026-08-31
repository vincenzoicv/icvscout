(function(){
  'use strict';
  window.lucide?.createIcons();
  if(document.getElementById('pageTheme')){
    for(const link of document.querySelectorAll('.page-header nav>a'))if(new URL(link.href).pathname===location.pathname)link.setAttribute('aria-current','page');
    if(location.pathname==='/classifica')document.querySelector('.classifica-menu summary')?.setAttribute('aria-current','page');
  }
  const theme=document.getElementById('pageTheme');
  if(theme){
    try{document.body.classList.toggle('light',localStorage.getItem('icv-theme')==='light');}catch{}
    const sync=()=>{const light=document.body.classList.contains('light');theme.setAttribute('aria-pressed',String(light));theme.setAttribute('title',light?'Attiva tema scuro':'Attiva tema chiaro');};
    sync();theme.addEventListener('click',()=>{document.body.classList.toggle('light');try{localStorage.setItem('icv-theme',document.body.classList.contains('light')?'light':'dark');}catch{}sync();});
  }
  for(const menu of document.querySelectorAll('.classifica-menu')){
    document.addEventListener('click',event=>{if(!menu.contains(event.target))menu.open=false;});
    menu.addEventListener('keydown',event=>{if(event.key==='Escape' && menu.open){menu.open=false;menu.querySelector('summary').focus();}});
  }
})();
