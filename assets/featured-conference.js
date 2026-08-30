(function () {
  'use strict';
  const root=document.getElementById('featuredConference');
  if (!root) return;
  const stage=document.getElementById('conferenceStage');
  const embed=document.getElementById('conferenceEmbed');
  const load=document.getElementById('conferenceLoad');
  const stop=document.getElementById('conferenceStop');
  const status=document.getElementById('conferenceStatus');
  const poster=document.getElementById('conferencePoster');
  let selected=null, pending=null, timer, firstRender=true;

  function postUrl(value) {
    try {
      const url=new URL(value);
      return url.protocol==='https:' && url.hostname==='www.instagram.com' && !url.username && !url.password && !url.port && /^\/(reel|p)\/[\w-]+\/$/.test(url.pathname) ? url.origin+url.pathname : null;
    } catch {return null;}
  }
  function syncConsent() {
    load.querySelector('span').textContent=window.ICVPrivacy?.enabled('external_media') ? 'Carica video Instagram' : 'Consenti e carica video';
    document.getElementById('conferencePosterPlay').setAttribute('aria-label',load.querySelector('span').textContent);
  }
  function closePlayer(focus) {
    clearTimeout(timer);embed.replaceChildren();embed.hidden=true;
    stage.classList.remove('is-active');stage.removeAttribute('aria-busy');
    load.hidden=false;stop.hidden=true;status.textContent='';
    if (pending) {const next=pending;pending=null;render(next);}
    if(focus)load.focus({preventScroll:true});
  }
  function openPlayer() {
    if(!selected || embed.childElementCount)return;
    if(!window.ICVPrivacy){status.textContent='Preferenze privacy non disponibili. Puoi aprire il post su Instagram.';return;}
    if(!window.ICVPrivacy.enabled('external_media'))window.ICVPrivacy.save({...window.ICVPrivacy.get(),external_media:true});
    const frame=document.createElement('iframe');
    frame.title=selected.title;frame.src=postUrl(selected.post_url)+'embed/';
    frame.allow='fullscreen; encrypted-media; picture-in-picture';frame.referrerPolicy='strict-origin-when-cross-origin';
    stage.setAttribute('aria-busy','true');status.textContent='Caricamento Instagram...';
    frame.addEventListener('load',()=>{clearTimeout(timer);stage.removeAttribute('aria-busy');status.textContent='Se il video non compare, apri il post su Instagram.';});
    frame.addEventListener('error',()=>{closePlayer(false);status.textContent='Player non disponibile. Puoi guardare il post su Instagram.';});
    timer=setTimeout(()=>{stage.removeAttribute('aria-busy');status.textContent='Caricamento lento. Puoi aprire il post originale su Instagram.';},12000);
    embed.hidden=false;embed.append(frame);stage.classList.add('is-active');load.hidden=true;stop.hidden=false;
    frame.focus({preventScroll:true});stage.scrollIntoView({block:'start',behavior:'instant'});
  }
  function render(value) {
    const next=value && postUrl(value.post_url) && Number.isFinite(Date.parse(value.published_at)) ? value : null;
    if(next && selected && next.id!==selected.id && embed.childElementCount){pending=next;return;}
    if(!next){pending=null;closePlayer(false);selected=null;root.hidden=true;return;}
    selected=next;root.hidden=false;
    document.getElementById('conferenceTitle').textContent=next.title || 'Conferenza stampa';
    document.getElementById('conferencePhase').textContent={pre:'Pre partita',post:'Post partita',press:'Conferenza stampa'}[next.phase] || 'Conferenza stampa';
    document.getElementById('conferenceSummary').textContent={pre:'Le parole del mister alla vigilia della partita.',post:'Le parole del mister dopo la partita.',press:'La conferenza stampa pubblicata su Il Calcio di Vince.'}[next.phase] || '';
    document.getElementById('conferenceOriginal').href=postUrl(next.post_url);
    const date=new Date(next.published_at),time=document.getElementById('conferenceDate');
    time.dateTime=date.toISOString();time.textContent=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Rome'}).format(date);
    const image=String(next.thumbnail_url || '');
    if(/^\/api\/public\/conference-thumbnail\?id=\d+&v=/.test(image) && poster.getAttribute('src')!==image){poster.hidden=false;poster.src=image;poster.alt=next.title || 'Conferenza stampa';}
    syncConsent();
    if(firstRender && location.hash==='#featuredConference')requestAnimationFrame(()=>root.scrollIntoView({block:'start'}));
    firstRender=false;
  }
  load.addEventListener('click',openPlayer);
  document.getElementById('conferencePosterPlay').addEventListener('click',openPlayer);
  stop.addEventListener('click',()=>closePlayer(true));
  poster.addEventListener('error',()=>{poster.hidden=true;status.textContent='Anteprima non disponibile. Il video resta accessibile su Instagram.';});
  window.addEventListener('icv:privacychange',()=>{syncConsent();if(!window.ICVPrivacy?.enabled('external_media'))closePlayer(false);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)closePlayer(false);});
  new IntersectionObserver(entries=>{if(!entries[0].isIntersecting && embed.childElementCount)closePlayer(false);}).observe(root);
  window.ICVConference={render};
})();
