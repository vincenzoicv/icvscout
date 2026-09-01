(function () {
  'use strict';
  const root=document.getElementById('featuredHighlights');
  if(!root)return;
  const stage=document.getElementById('highlightsStage'),embed=document.getElementById('highlightsEmbed');
  const play=document.getElementById('highlightsPlay'),stop=document.getElementById('highlightsStop');
  const poster=document.getElementById('highlightsPoster'),status=document.getElementById('highlightsStatus');
  let selected=null,timer,firstRender=true;
  function syncConsent(){
    const label=window.ICVPrivacy?.enabled('external_media')?'Carica highlights YouTube':'Consenti e carica highlights YouTube';
    play.setAttribute('aria-label',label);play.title=label;
  }
  function closePlayer(focus=false){
    clearTimeout(timer);embed.replaceChildren();embed.hidden=true;
    play.hidden=false;stop.hidden=true;stage.removeAttribute('aria-busy');status.textContent='';
    if(focus)play.focus({preventScroll:true});
  }
  function render(value){
    if(!value || !/^[\w-]{11}$/.test(value.video_id || '')){
      closePlayer();selected=null;root.hidden=true;poster.removeAttribute('src');return;
    }
    if(selected?.video_id!==value.video_id){
      closePlayer();poster.hidden=false;
      poster.src='/api/public/highlights-thumbnail?id='+value.video_id;
    }
    selected=value;root.hidden=false;
    document.getElementById('highlightsHeading').textContent=value.title || 'Highlights';
    document.getElementById('highlightsOriginal').href='https://www.youtube.com/watch?v='+value.video_id;
    poster.alt='Highlights '+(value.title || 'Juventus');syncConsent();
    if(firstRender && location.hash==='#featuredHighlights')requestAnimationFrame(()=>root.scrollIntoView({block:'start'}));
    firstRender=false;
  }
  play.addEventListener('click',()=>{
    if(!selected || embed.childElementCount)return;
    if(!window.ICVPrivacy){status.textContent='Preferenze privacy non disponibili. Usa il link Guarda su YouTube.';return;}
    if(!window.ICVPrivacy.enabled('external_media'))window.ICVPrivacy.save({...window.ICVPrivacy.get(),external_media:true});
    const frame=document.createElement('iframe');
    frame.title='Highlights '+selected.title;
    frame.src='https://www.youtube-nocookie.com/embed/'+selected.video_id+'?playsinline=1';
    frame.referrerPolicy='strict-origin-when-cross-origin';
    frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.allowFullscreen=true;
    stage.setAttribute('aria-busy','true');status.textContent='Caricamento YouTube...';
    frame.addEventListener('load',()=>{clearTimeout(timer);stage.removeAttribute('aria-busy');status.textContent='Se il video non e disponibile qui, scegli Guarda su YouTube.';});
    frame.addEventListener('error',()=>{closePlayer();status.textContent='Player non disponibile. Scegli Guarda su YouTube.';});
    timer=setTimeout(()=>{stage.removeAttribute('aria-busy');status.textContent='Caricamento lento. Puoi scegliere Guarda su YouTube.';},12000);
    embed.hidden=false;embed.append(frame);play.hidden=true;stop.hidden=false;
    frame.focus({preventScroll:true});
  });
  stop.addEventListener('click',()=>closePlayer(true));
  poster.addEventListener('error',()=>{poster.hidden=true;status.textContent='Anteprima non disponibile. Puoi caricare il video o aprirlo su YouTube.';});
  window.addEventListener('icv:privacychange',()=>{syncConsent();if(!window.ICVPrivacy?.enabled('external_media'))closePlayer();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)closePlayer();});
  new IntersectionObserver(entries=>{if(!entries[0].isIntersecting && embed.childElementCount)closePlayer();}).observe(root);
  window.ICVHighlights={render};
})();
