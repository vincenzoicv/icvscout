(function(){
  'use strict';
  const list=document.getElementById('newsList');
  const status=document.getElementById('newsStatus');
  const input=document.getElementById('newsSearch');
  const count=document.getElementById('newsCount');
  const filters=document.getElementById('newsFilters');
  const retry=document.getElementById('newsRetry');
  const sourceSelect=document.getElementById('newsSource'),periodSelect=document.getElementById('newsPeriod'),reset=document.getElementById('newsReset');
  if(!list||!status||!input||!count||!filters||!retry||!sourceSelect||!periodSelect||!reset)return;
  const pagination=document.getElementById('newsPagination'),previous=document.getElementById('newsPrevious'),next=document.getElementById('newsNext'),pageLabel=document.getElementById('newsPageLabel');
  let items=[],category='',loading=false,page=1;
  const pageSize=10;
  const escape=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalize=value=>String(value||'').toLocaleLowerCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const categoryKey=item=>{const key=normalize(item.category||'juventus');return key==='mercato'?'calciomercato':key;};
  const categoryLabel=key=>({juventus:'Juventus',calciomercato:'Mercato',mercato:'Mercato',infortuni:'Infortuni',tattica:'Tattica',partite:'Partite',ufficiale:'Ufficiale'}[key]||key.replace(/[_-]/g,' ').replace(/^./,char=>char.toLocaleUpperCase('it')));
  function safeUrl(value,fallback){
    if(typeof value!=='string'||!value.trim())return fallback;
    try{const url=new URL(value,location.origin);return url.protocol==='https:'?url.href:fallback;}catch{return fallback;}
  }
  function readUrl(){
    const params=new URLSearchParams(location.search);
    input.value=(params.get('q')||'').slice(0,100);
    category=params.get('categoria')||'';
    sourceSelect.value=params.get('fonte')||'';
    periodSelect.value=['day','week','month'].includes(params.get('periodo'))?params.get('periodo'):'all';
    const requested=Number(params.get('pagina'));
    page=Number.isSafeInteger(requested)&&requested>0?requested:1;
  }
  function writeUrl(){
    const url=new URL(location.href);
    for(const [key,value] of [['q',input.value.trim()],['categoria',category],['fonte',sourceSelect.value],['periodo',periodSelect.value==='all'?'':periodSelect.value],['pagina',page>1?String(page):'']]){
      if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);
    }
    history.replaceState(null,'',url);
  }
  function render(){
    const query=normalize(input.value);
    const days={day:1,week:7,month:30}[periodSelect.value];
    const now=Date.now();
    const visible=items.filter(item=>(!category||categoryKey(item)===category)&&(!sourceSelect.value||item.source===sourceSelect.value)&&(!days||(new Date(item.created_at).getTime()>=now-days*86400000&&new Date(item.created_at).getTime()<=now))&&normalize([item.title,item.body,item.category,item.source].join(' ')).includes(query));
    reset.hidden=!query&&!category&&!sourceSelect.value&&!days;
    count.textContent=visible.length+' '+(visible.length===1?'notizia':'notizie');
    const pages=Math.max(1,Math.ceil(visible.length/pageSize));
    page=Math.min(Math.max(1,page),pages);
    const start=(page-1)*pageSize,shown=visible.slice(start,start+pageSize);
    if(pagination){
      pagination.hidden=pages<=1;
      previous.disabled=page===1;next.disabled=page===pages;
      pageLabel.textContent='Pagina '+page+' di '+pages+' · '+(start+1)+'-'+(start+shown.length)+' di '+visible.length;
    }
    list.innerHTML=shown.map((item,index)=>{
      const source=safeUrl(item.source_url,'/community?news='+encodeURIComponent(item.id));
      const discussion='/community?news='+encodeURIComponent(item.id);
      const parsedDate=new Date(item.created_at||'');
      const date=Number.isFinite(parsedDate.getTime())?new Intl.DateTimeFormat('it-IT',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Rome'}).format(parsedDate):'';
      const external=new URL(source,location.origin).origin!==location.origin;
      const target=external?' target="_blank" rel="noopener noreferrer"':'';
      const body=normalize(item.body)!==normalize(item.title)?item.body:'';
      const lead=page===1&&index===0;
      return '<article class="news-item'+(lead?' news-lead':'')+'"><div class="news-item-meta"><strong>'+escape(categoryLabel(categoryKey(item)))+'</strong>'+(date?'<time datetime="'+escape(parsedDate.toISOString())+'">'+escape(date)+'</time>':'')+'<span>'+escape(item.source||'Il Calcio di Vince')+'</span></div>'+(lead?'<span class="news-lead-label">In primo piano</span>':'')+'<h2><a href="'+escape(source)+'"'+target+'>'+escape(item.title)+'</a></h2>'+(body?'<p>'+escape(body)+'</p>':'')+'<div class="news-item-actions"><a href="'+escape(source)+'"'+target+'>'+(source===discussion?'Leggi su ICV':'Apri la fonte'+(external?' (nuova scheda)':''))+'<i data-lucide="'+(external?'arrow-up-right':'arrow-right')+'" aria-hidden="true"></i></a><a href="'+discussion+'">Discussione ICV<i data-lucide="message-circle" aria-hidden="true"></i></a></div></article>';
    }).join('');
    if(!visible.length)status.textContent=items.length?'Nessuna notizia corrisponde ai filtri.':'Non ci sono notizie pubblicate al momento.';
    else status.textContent='';
    window.lucide?.createIcons();
  }
  function renderFilters(){
    filters.replaceChildren();
    for(const key of ['',...new Set([...items.map(categoryKey),...(category?[category]:[])])]){
      const button=document.createElement('button');
      button.type='button';button.dataset.category=key;button.textContent=key?categoryLabel(key):'Tutte';
      button.setAttribute('aria-pressed',String(key===category));filters.appendChild(button);
    }
  }
  filters.addEventListener('click',event=>{
    const button=event.target.closest('button[data-category]');
    if(!button)return;
    category=button.dataset.category;page=1;
    for(const item of filters.children)item.setAttribute('aria-pressed',String(item===button));
    render();
    writeUrl();
  });
  input.maxLength=100;
  input.addEventListener('input',()=>{page=1;render();writeUrl();});
  for(const select of [sourceSelect,periodSelect])select.addEventListener('change',()=>{page=1;render();writeUrl();});
  reset.addEventListener('click',()=>{input.value='';category='';sourceSelect.value='';periodSelect.value='all';page=1;renderFilters();render();writeUrl();input.focus();});
  window.addEventListener('popstate',()=>{readUrl();renderFilters();render();writeUrl();});
  for(const [button,direction] of [[previous,-1],[next,1]])button?.addEventListener('click',()=>{
    page+=direction;render();writeUrl();
    const heading=list.querySelector('h2');
    if(heading){heading.tabIndex=-1;heading.focus();}
  });
  async function load(){
    if(loading)return;
    loading=true;
    const retrying=document.activeElement===retry;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    retry.hidden=true;input.disabled=true;list.setAttribute('aria-busy','true');status.textContent='Caricamento notizie...';
    try{
      const response=await fetch('/api/public/news?limit=30',{headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error('News non disponibili');
      const data=await response.json();
      if(!Array.isArray(data))throw new Error('Risposta non valida');
      items=data.filter(item=>item&&typeof item.title==='string');
      sourceSelect.replaceChildren(new Option('Tutte le fonti',''));
      for(const source of [...new Set(items.map(item=>item.source).filter(source=>typeof source==='string'&&source))].sort((a,b)=>a.localeCompare(b,'it')))sourceSelect.add(new Option(source,source));
      readUrl();renderFilters();render();writeUrl();
    }catch{status.textContent='Non riusciamo a caricare le notizie. Riprova tra poco.';retry.hidden=false;}
    finally{clearTimeout(timeout);loading=false;list.setAttribute('aria-busy','false');input.disabled=false;if(retrying){if(retry.hidden)input.focus();else retry.focus();}}
  }
  retry.addEventListener('click',load);load();
})();
