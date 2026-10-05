(function(){
  'use strict';
  const form=document.getElementById('siteSearchForm');if(!form)return;
  const input=document.getElementById('siteSearchInput'),status=document.getElementById('searchStatus'),results=document.getElementById('searchResults'),filters=document.getElementById('searchFilters'),retry=document.getElementById('searchRetry');
  const labels={news:'Notizie',match:'Partite',player:'Giocatori',market:'Mercato',social:'Social'};
  const icons={news:'newspaper',match:'calendar-days',player:'user-round',market:'arrow-right-left',social:'message-circle'};
  let items=[],activeType='all',requestId=0,controller=null,lastQuery='';
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function safeUrl(value){
    if(typeof value!=='string'||!value.trim())return null;
    try{const url=new URL(value,location.origin);return (url.origin===location.origin&&['http:','https:'].includes(url.protocol))||url.protocol==='https:'?url:null;}catch{return null;}
  }
  function writeUrl(push=false){
    const url=new URL(location.href);url.searchParams.set('q',lastQuery);
    if(activeType==='all')url.searchParams.delete('tipo');else url.searchParams.set('tipo',activeType);
    if(url.href!==location.href)history[push?'pushState':'replaceState'](null,'',url);
  }
  function render(){
    filters.replaceChildren();filters.hidden=!items.length;
    for(const type of ['all',...Object.keys(labels).filter(type=>type===activeType||items.some(item=>item.type===type))]){
      const button=document.createElement('button');button.type='button';button.dataset.type=type;
      button.setAttribute('aria-pressed',String(type===activeType));
      button.textContent=(type==='all'?'Tutti':labels[type])+' ('+(type==='all'?items.length:items.filter(item=>item.type===type).length)+')';
      button.addEventListener('click',()=>{activeType=type;writeUrl();render();filters.querySelector('[data-type="'+type+'"]')?.focus();});
      filters.appendChild(button);
    }
    const visible=items.filter(item=>activeType==='all'||item.type===activeType);
    status.textContent=visible.length?visible.length+' risultat'+(visible.length===1?'o':'i')+' per “'+lastQuery+'”':items.length?'Nessun risultato in questa categoria.':'Nessun risultato per “'+lastQuery+'”. Prova con un altro nome.';
    results.innerHTML=visible.map(item=>{
      const url=safeUrl(item.href);if(!url)return '';
      const external=url.origin!==location.origin,date=new Date(item.date);
      const dateText=item.date&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Rome'}).format(date):'';
      return `<a class="search-result" href="${escapeHtml(url.href)}"${external?' target="_blank" rel="noopener noreferrer"':''}><span class="search-result-icon" aria-hidden="true"><i data-lucide="${icons[item.type]||'file-text'}"></i></span><span class="search-result-copy"><span class="search-result-meta">${escapeHtml(labels[item.type]||'Contenuto')}${dateText?' · '+escapeHtml(dateText):''}</span><strong>${escapeHtml(item.title)}</strong>${item.summary?`<span class="search-result-summary">${escapeHtml(item.summary)}</span>`:''}<span class="search-result-destination">${external?escapeHtml(url.hostname.replace(/^www\./,''))+' · Apri la fonte (nuova scheda)':'Apri nel sito'}</span></span><i class="search-result-arrow" data-lucide="${external?'arrow-up-right':'arrow-right'}" aria-hidden="true"></i></a>`;
    }).join('');
    window.lucide?.createIcons();
  }
  async function run(query,push=false,type='all'){
    const retrying=document.activeElement===retry;
    const id=++requestId;controller?.abort();lastQuery=query.trim().slice(0,100);activeType=labels[type]?type:'all';
    retry.hidden=true;filters.hidden=true;items=[];results.replaceChildren();results.setAttribute('aria-busy','false');
    if(lastQuery.length<2){status.textContent='Inserisci almeno due caratteri.';return;}
    writeUrl(push);status.textContent='Ricerca in corso…';results.setAttribute('aria-busy','true');
    controller=new AbortController();const currentController=controller,signal=currentController.signal;const timeout=setTimeout(()=>currentController.abort(),15000);
    try{
      const response=await fetch('/api/public/search?q='+encodeURIComponent(lastQuery),{headers:{Accept:'application/json'},signal});
      if(!response.ok)throw new Error();
      const data=await response.json();if(!Array.isArray(data.results))throw new Error();
      if(id!==requestId)return;
      items=data.results.filter(item=>item&&typeof item.title==='string'&&safeUrl(item.href));
      render();
    }catch{
      if(id!==requestId)return;
      status.textContent='Ricerca temporaneamente non disponibile. Riprova tra poco.';retry.hidden=false;
    }finally{
      clearTimeout(timeout);if(id===requestId){results.setAttribute('aria-busy','false');if(retrying){const target=retry.hidden?status:retry;if(target===status)target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}}
    }
  }
  form.addEventListener('submit',event=>{event.preventDefault();run(input.value,true,activeType);});
  retry.addEventListener('click',()=>run(lastQuery,false,activeType));
  function fromUrl(){const params=new URLSearchParams(location.search);input.value=params.get('q')||'';run(input.value,false,params.get('tipo')||'all');}
  window.addEventListener('popstate',fromUrl);fromUrl();
})();
