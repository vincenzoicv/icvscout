(function(){
  'use strict';
  const sections=[...document.querySelectorAll('[data-media-section]')],filters=[...document.querySelectorAll('[data-filter]')];
  const search=document.getElementById('mediaSearch'),order=document.getElementById('mediaOrder'),reset=document.getElementById('mediaReset'),status=document.getElementById('mediaStatus'),error=document.getElementById('mediaError'),retry=document.getElementById('mediaRetry'),empty=document.getElementById('mediaEmpty'),grid=document.getElementById('albumList');
  if(!search||!order||!reset)return;
  let data=null,loading=false,selectedAlbum=null;
  const labels={tutti:'Tutti',video:'Interviste e video','sala-stampa':'Sala stampa',foto:'Foto',storie:'Storie bianconere'};
  const normalize=value=>String(value||'').toLocaleLowerCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const matches=item=>normalize(item.title).includes(normalize(search.value.trim()));
  const active=()=>filters.some(item=>item.dataset.filter===location.hash.slice(1))?location.hash.slice(1):'tutti';
  function readUrl(){const params=new URLSearchParams(location.search);search.value=(params.get('q')||'').slice(0,100);order.value=params.get('ordine')==='oldest'?'oldest':'recent';}
  function writeUrl(){const url=new URL(location.href);if(search.value.trim())url.searchParams.set('q',search.value.trim());else url.searchParams.delete('q');if(order.value==='oldest')url.searchParams.set('ordine','oldest');else url.searchParams.delete('ordine');history.replaceState(null,'',url);}
  function sorted(items,key){return [...items].sort((a,b)=>{const first=Date.parse(a[key])||0,second=Date.parse(b[key])||0;return order.value==='oldest'?first-second:second-first;});}
  function filter(){
    const type=active();
    for(const item of filters)item.setAttribute('aria-pressed',String(item.dataset.filter===type));
    for(const section of sections)section.hidden=type!=='tutti'&&section.dataset.mediaSection!==type;
    if(type!=='storie'&&type!=='tutti')document.getElementById('icvStoryVideo')?.pause();
    reset.hidden=!search.value.trim()&&order.value==='recent'&&type==='tutti';
    if(!data)return;
    const conferences=sorted(data.conferences.filter(matches),'published_at'),albums=sorted(data.albums.filter(matches),'date');
    const story=matches({title:document.getElementById('storiesHeading').textContent})?1:0;
    const videos=sorted(data.videos.filter(item=>matches({title:item.title+' '+item.description})),'published_at');
    window.ICVVideos.render(document.getElementById('mediaVideoList'),videos);
    document.getElementById('noVideos').hidden=videos.length>0;
    const counts={video:videos.length,'sala-stampa':conferences.length,foto:albums.length,storie:story,tutti:conferences.length+albums.length+story+videos.length};
    for(const button of filters)button.textContent=labels[button.dataset.filter]+' ('+counts[button.dataset.filter]+')';
    window.ICVConference.render(conferences[0],conferences.slice(1));
    document.getElementById('noConferences').hidden=conferences.length>0;
    grid.replaceChildren();
    for(const album of albums){
      const button=document.createElement('button'),image=document.createElement('img'),title=document.createElement('strong'),date=document.createElement('time');
      button.type='button';button.className='album-card';button.setAttribute('aria-label','Apri album '+album.title);button.setAttribute('aria-controls','matchGallery');
      image.src=album.photos[0].url;image.alt=album.photos[0].caption||album.title;image.width=640;image.height=480;image.loading='lazy';image.decoding='async';
      image.addEventListener('error',()=>{if(image.dataset.fallback)return;image.dataset.fallback='true';image.classList.add('album-image-error');image.alt='Anteprima non disponibile: '+album.title;image.src='/assets/icv-logo-160.jpg';});
      title.textContent=album.title;const parsed=new Date(album.date+'T12:00:00');
      date.textContent=(Number.isFinite(parsed.getTime())?new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Rome'}).format(parsed)+' · ':'')+album.photos.length+' foto';
      if(Number.isFinite(parsed.getTime()))date.dateTime=album.date;
      button.append(image,title,date);
      button.addEventListener('click',()=>{selectedAlbum=album.id??album.title;window.ICVGallery.render(album);const heading=document.getElementById('matchGalleryHeading');heading.tabIndex=-1;heading.focus({preventScroll:true});heading.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});});grid.append(button);
    }
    if(selectedAlbum!==null&&!albums.some(album=>(album.id??album.title)===selectedAlbum)){selectedAlbum=null;window.ICVGallery.render(null);}
    document.getElementById('noAlbums').hidden=albums.length>0;
    document.getElementById('storieBianconere').hidden=!story;
    empty.hidden=counts[type]>0;
    status.textContent=counts[type]+' contenut'+(counts[type]===1?'o':'i');
  }
  for(const button of filters)button.addEventListener('click',()=>{location.hash=button.dataset.filter;});
  search.addEventListener('input',()=>{writeUrl();filter();});order.addEventListener('change',()=>{writeUrl();filter();});
  reset.addEventListener('click',()=>{search.value='';order.value='recent';const url=new URL(location.href);url.hash='tutti';history.replaceState(null,'',url);writeUrl();filter();search.focus();});
  window.addEventListener('hashchange',filter);window.addEventListener('popstate',()=>{readUrl();filter();});
  async function load(){
    if(loading)return;loading=true;const retrying=document.activeElement===retry;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    error.hidden=true;status.textContent='Caricamento contenuti...';grid.setAttribute('aria-busy','true');
    try{
      const response=await fetch('/api/public/media',{cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});if(!response.ok)throw new Error();const result=await response.json();
      if(!Array.isArray(result.conferences)||!Array.isArray(result.albums))throw new Error();
      data={conferences:result.conferences.filter(item=>item&&typeof item.title==='string'),albums:result.albums.filter(item=>item&&typeof item.title==='string'&&Array.isArray(item.photos)&&item.photos.length)};
      data.videos=Array.isArray(result.videos)?result.videos.filter(item=>item&&typeof item.title==='string'):[];
      filter();
    }catch{if(data)filter();else status.textContent='';error.hidden=false;}
    finally{clearTimeout(timeout);loading=false;grid.setAttribute('aria-busy','false');if(retrying)(error.hidden?search:retry).focus({preventScroll:true});}
  }
  retry.addEventListener('click',load);readUrl();filter();load();
})();
