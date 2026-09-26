(function(){
  'use strict';
  const list=document.getElementById('newsList');
  const status=document.getElementById('newsStatus');
  const input=document.getElementById('newsSearch');
  const count=document.getElementById('newsCount');
  if(!list||!status||!input||!count)return;
  let items=[];
  const escape=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function safeUrl(value,fallback){
    try{const url=new URL(value,location.origin);return url.protocol==='https:'?url.href:fallback;}catch{return fallback;}
  }
  function render(){
    const query=input.value.trim().toLocaleLowerCase('it');
    const visible=items.filter(item=>[item.title,item.body,item.category,item.source].join(' ').toLocaleLowerCase('it').includes(query));
    count.textContent=visible.length+' '+(visible.length===1?'notizia':'notizie');
    list.innerHTML=visible.map(item=>{
      const source=safeUrl(item.source_url,'/community?news='+encodeURIComponent(item.id));
      const discussion='/community?news='+encodeURIComponent(item.id);
      const parsedDate=new Date(item.created_at||'');
      const date=Number.isFinite(parsedDate.getTime())?new Intl.DateTimeFormat('it-IT',{dateStyle:'medium'}).format(parsedDate):'';
      const target=source.startsWith(location.origin)?'':' target="_blank" rel="noopener noreferrer"';
      return '<article class="news-item"><div class="news-item-meta"><strong>'+escape(item.category||'Juventus')+'</strong><time datetime="'+escape(item.created_at||'')+'">'+escape(date)+'</time><span>'+escape(item.source||'ICV Scout')+'</span></div><h2><a href="'+escape(source)+'"'+target+'>'+escape(item.title)+'</a></h2><p>'+escape(item.body||'')+'</p><div class="news-item-actions"><a href="'+escape(source)+'"'+target+'>Apri la fonte</a><a href="'+discussion+'">Discussione ICV</a></div></article>';
    }).join('');
    if(!visible.length)status.textContent=query?'Nessuna notizia corrisponde alla ricerca.':'Non ci sono notizie pubblicate al momento.';
    else status.textContent='';
  }
  input.addEventListener('input',render);
  fetch('/api/public/news?limit=30',{headers:{Accept:'application/json'},cache:'no-store'})
    .then(response=>{if(!response.ok)throw new Error('News non disponibili');return response.json();})
    .then(data=>{items=Array.isArray(data)?data:[];list.setAttribute('aria-busy','false');render();})
    .catch(()=>{list.setAttribute('aria-busy','false');status.textContent='Non riusciamo a caricare le notizie. Riprova tra poco.';});
})();
