(function(){
  'use strict';
  const validURL=value=>typeof value==='string'&&/^\/api\/public\/video-file\?id=[a-f0-9-]{36}(?:&asset=(?:cover|captions))?$/.test(value);
  const players=new Set();
  function embedURL(item){
    if(item.kind==='instagram'&&/^https:\/\/www\.instagram\.com\/(?:reel|p)\/[\w-]{5,64}\/$/.test(item.source_url||''))return item.source_url+'embed/';
    if(item.kind==='tiktok'){const match=(item.source_url||'').match(/^https:\/\/www\.tiktok\.com\/@[\w.-]{1,64}\/video\/(\d{10,25})$/);if(match)return 'https://www.tiktok.com/player/v1/'+match[1]+'?autoplay=0&controls=1&loop=0&description=0&music_info=0';}
    return null;
  }
  function stopAll(except){document.querySelectorAll('.editorial-video video').forEach(v=>{if(v!==except)v.pause();});for(const player of players)if(player.frame!==except)player.close();}
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(!entry.isIntersecting)for(const player of players)if(player.frame===entry.target)player.close();});
  function socialPlayer(frame,item,url,error){
    const provider=item.kind==='tiktok'?'TikTok':'Instagram';frame.classList.add('editorial-social-frame');
    const load=document.createElement('button');load.type='button';load.className='editorial-social-load';
    const label=()=>{load.textContent=(window.ICVPrivacy?.enabled('external_media')?'Carica video ':'Consenti e carica video ')+provider;};label();
    const close=document.createElement('button');close.type='button';close.className='editorial-social-close';close.textContent='Chiudi video';close.hidden=true;
    const disclosure=document.createElement('p');disclosure.className='editorial-social-privacy';disclosure.textContent=provider+' riceve dati di navigazione e puo usare cookie.';
    const player={frame,iframe:null,close(){if(player.iframe){player.iframe.remove();player.iframe=null;}load.hidden=false;close.hidden=true;label();}};players.add(player);observer.observe(frame);
    load.addEventListener('click',()=>{
      if(!window.ICVPrivacy){error.textContent='Preferenze privacy non disponibili. Ricarica la pagina.';error.hidden=false;return;}
      if(!window.ICVPrivacy.enabled('external_media'))window.ICVPrivacy.save({...window.ICVPrivacy.get(),external_media:true});
      stopAll(frame);error.hidden=true;const iframe=document.createElement('iframe');iframe.title=item.title+' · '+provider;iframe.src=url;iframe.allow='fullscreen; encrypted-media; picture-in-picture';iframe.referrerPolicy='strict-origin-when-cross-origin';iframe.allowFullscreen=true;
      iframe.addEventListener('error',()=>{error.textContent='Video non disponibile. Il contenuto deve essere pubblico e consentire l\'incorporamento.';error.hidden=false;});player.iframe=iframe;frame.prepend(iframe);load.hidden=true;close.hidden=false;
    });close.addEventListener('click',()=>player.close());frame.append(load,disclosure,close);
  }
  function render(root,items){
    for(const player of players)if(root.contains(player.frame)||!player.frame.isConnected){player.close();observer.unobserve(player.frame);players.delete(player);}
    root.querySelectorAll('video').forEach(video=>video.pause());root.replaceChildren();
    for(const item of items){
      const social=embedURL(item);if(!social&&!validURL(item.url))continue;
      const card=document.createElement('article');card.className='editorial-video';
      const frame=document.createElement('div');frame.className='editorial-video-frame';
      const error=document.createElement('p');error.className='editorial-video-error';error.hidden=true;error.setAttribute('role','status');error.textContent='Video non disponibile o formato non supportato.';
      if(social){socialPlayer(frame,item,social,error);}else{
      const video=document.createElement('video');video.controls=true;video.preload='none';video.playsInline=true;
      video.setAttribute('aria-label',item.title);video.src=item.url;
      video.poster=validURL(item.poster)?item.poster:'/assets/icv-logo-160.jpg';
      if(validURL(item.captions)){const track=document.createElement('track');track.kind='captions';track.srclang='it';track.label='Italiano';track.src=item.captions;video.append(track);}
      video.addEventListener('play',()=>stopAll(video));
      video.addEventListener('error',()=>{error.hidden=false;});
      frame.append(video);}
      const title=document.createElement('h3');title.textContent=item.title;
      const date=document.createElement('time');const parsed=new Date(item.published_at||item.created_at||NaN);if(Number.isFinite(parsed.getTime())){date.dateTime=parsed.toISOString();date.textContent=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric'}).format(parsed);}
      card.append(frame,date,title);if(item.description){const description=document.createElement('p');description.textContent=item.description;card.append(description);}card.append(error);root.append(card);
    }
  }
  window.ICVVideos={render};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAll();});
  window.addEventListener('pagehide',()=>stopAll());
  window.addEventListener('icv:privacychange',()=>{for(const player of players){if(!window.ICVPrivacy?.enabled('external_media'))player.close();}});
  window.addEventListener('message',event=>{if(event.origin!=='https://www.tiktok.com'||event.data?.['x-tiktok-player']!==true)return;for(const player of players)if(player.iframe?.contentWindow===event.source&&event.data.type==='onPlayerError'){player.close();const error=player.frame.closest('article').querySelector('.editorial-video-error');error.textContent='TikTok non puo riprodurre questo video. Verifica che sia pubblico e incorporabile.';error.hidden=false;}});
  const home=document.getElementById('homeVideos');
  if(home){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    fetch('/api/public/videos',{cache:'no-store',signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error();return response.json();}).then(data=>{if(!Array.isArray(data.videos))return;render(document.getElementById('homeVideoList'),data.videos.slice(0,3));home.hidden=!home.querySelector('article');}).catch(()=>{}).finally(()=>clearTimeout(timeout));
  }
})();
