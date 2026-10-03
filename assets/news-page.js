(function(){
  'use strict';
  const list=document.getElementById('newsList');
  const status=document.getElementById('newsStatus');
  const input=document.getElementById('newsSearch');
  const count=document.getElementById('newsCount');
  const filters=document.getElementById('newsFilters');
  const retry=document.getElementById('newsRetry');
  if(!list||!status||!input||!count||!filters||!retry)return;
  let items=[],category='';
  const escape=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalize=value=>String(value||'').toLocaleLowerCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const categoryKey=item=>{const key=normalize(item.category||'juventus');return key==='mercato'?'calciomercato':key;};
  const categoryLabel=key=>({juventus:'Juventus',calciomercato:'Mercato',mercato:'Mercato',infortuni:'Infortuni',tattica:'Tattica',partite:'Partite',ufficiale:'Ufficiale'}[key]||key.replace(/[_-]/g,' ').replace(/^./,char=>char.toLocaleUpperCase('it')));
  function safeUrl(value,fallback){
    try{const url=new URL(value,location.origin);return url.protocol==='https:'?url.href:fallback;}catch{return fallback;}
  }
  function render(){
    const query=normalize(input.value);
    const visible=items.filter(item=>(!category||categoryKey(item)===category)&&normalize([item.title,item.body,item.category,item.source].join(' ')).includes(query));
    count.textContent=visible.length+' '+(visible.length===1?'notizia':'notizie');
    list.innerHTML=visible.map((item,index)=>{
      const source=safeUrl(item.source_url,'/community?news='+encodeURIComponent(item.id));
      const discussion='/community?news='+encodeURIComponent(item.id);
      const parsedDate=new Date(item.created_at||'');
      const date=Number.isFinite(parsedDate.getTime())?new Intl.DateTimeFormat('it-IT',{dateStyle:'medium',timeStyle:'short'}).format(parsedDate):'';
      const target=source.startsWith(location.origin+'/')?'':' target="_blank" rel="noopener noreferrer"';
      const body=normalize(item.body)!==normalize(item.title)?item.body:'';
      return '<article class="news-item'+(index===0?' news-lead':'')+'"><div class="news-item-meta"><strong>'+escape(categoryLabel(categoryKey(item)))+'</strong>'+(date?'<time datetime="'+escape(parsedDate.toISOString())+'">'+escape(date)+'</time>':'')+'<span>'+escape(item.source||'Il Calcio di Vince')+'</span></div>'+(index===0?'<span class="news-lead-label">In primo piano</span>':'')+'<h2><a href="'+escape(source)+'"'+target+'>'+escape(item.title)+'</a></h2>'+(body?'<p>'+escape(body)+'</p>':'')+'<div class="news-item-actions"><a href="'+escape(source)+'"'+target+'>'+(source===discussion?'Leggi su ICV':'Apri la fonte')+'<i data-lucide="arrow-up-right" aria-hidden="true"></i></a><a href="'+discussion+'">Discussione ICV<i data-lucide="message-circle" aria-hidden="true"></i></a></div></article>';
    }).join('');
    if(!visible.length)status.textContent=items.length?'Nessuna notizia corrisponde ai filtri.':'Non ci sono notizie pubblicate al momento.';
    else status.textContent='';
    window.lucide?.createIcons();
  }
  function renderFilters(){
    filters.replaceChildren();
    for(const key of ['',...new Set(items.map(categoryKey))]){
      const button=document.createElement('button');
      button.type='button';button.dataset.category=key;button.textContent=key?categoryLabel(key):'Tutte';
      button.setAttribute('aria-pressed',String(key===category));filters.appendChild(button);
    }
  }
  filters.addEventListener('click',event=>{
    const button=event.target.closest('button[data-category]');
    if(!button)return;
    category=button.dataset.category;
    for(const item of filters.children)item.setAttribute('aria-pressed',String(item===button));
    render();
  });
  input.addEventListener('input',render);
  async function load(){
    retry.hidden=true;input.disabled=true;list.setAttribute('aria-busy','true');status.textContent='Caricamento notizie...';
    try{
      const response=await fetch('/api/public/news?limit=30',{headers:{Accept:'application/json'},cache:'no-store'});
      if(!response.ok)throw new Error('News non disponibili');
      const data=await response.json();
      if(!Array.isArray(data))throw new Error('Risposta non valida');
      items=data.filter(item=>item&&typeof item.title==='string');category='';renderFilters();render();
    }catch{status.textContent='Non riusciamo a caricare le notizie. Riprova tra poco.';retry.hidden=false;}
    finally{list.setAttribute('aria-busy','false');input.disabled=false;}
  }
  retry.addEventListener('click',load);load();
})();
