(function(){
  'use strict';
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const formatDate=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'}).format(date):'Data da confermare';};
  const cleanStatus=status=>({finished:'Finale',awarded:'Omologata',live:'In corso',in_play:'In corso',paused:'Intervallo',halftime:'Intervallo',scheduled:'In programma',timed:'In programma',pre_match:'In programma',postponed:'Rinviata',cancelled:'Annullata',suspended:'Sospesa'}[String(status||'').toLowerCase()]||status||'');
  const minuteLabel=item=>item.injuryTime?`${item.minute}+${item.injuryTime}'`:`${item.minute}'`;
  function resultLabel(type){return ({news:'News',match:'Partita',player:'Giocatore',market:'Mercato',social:'Social'}[type]||'Contenuto');}
  async function loadSearch(){
    const form=document.getElementById('siteSearchForm');if(!form)return;
    const input=document.getElementById('siteSearchInput'),status=document.getElementById('searchStatus'),results=document.getElementById('searchResults');
    const params=new URLSearchParams(location.search),initial=params.get('q')||'';input.value=initial;
    async function run(query,updateUrl){
      const value=query.trim();results.replaceChildren();
      if(value.length<2){status.textContent='Inserisci almeno due caratteri.';return;}
      status.textContent='Ricerca in corso…';
      if(updateUrl){const next=new URL(location.href);next.searchParams.set('q',value);history.replaceState(null,'',next);}
      try{
        const response=await fetch('/api/public/search?q='+encodeURIComponent(value),{headers:{Accept:'application/json'}});
        if(!response.ok)throw new Error('Ricerca temporaneamente non disponibile');
        const payload=await response.json(),items=Array.isArray(payload.results)?payload.results:[];
        status.textContent=items.length?`${items.length} risultat${items.length===1?'o':'i'}`:'Nessun risultato. Prova con un altro nome o termine.';
        items.forEach(item=>{const link=document.createElement('a');link.className='search-result';link.href=item.href||'/';if(/^https:\/\//i.test(link.href)){link.target='_blank';link.rel='noopener noreferrer';}link.innerHTML=`<span><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.summary||'')}</span></span><em>${escapeHtml(resultLabel(item.type))}</em>`;results.appendChild(link);});
      }catch(error){status.textContent=error.message||'Ricerca non disponibile. Riprova.';}
    }
    form.addEventListener('submit',event=>{event.preventDefault();run(input.value,true);});
    if(initial)run(initial,false);
  }
  function renderMatch(match){
    const root=document.getElementById('matchDetail');if(!root)return;
    document.title=`${match.home} – ${match.away} · ICV Scout`;
    const score=match.homeScore!==null&&match.awayScore!==null?`${match.homeScore} – ${match.awayScore}`:'–';
    const round=match.roundLabel?` · ${escapeHtml(match.roundLabel)}`:match.matchday?` · ${escapeHtml(match.matchday)}ª giornata`:'';
    const eventRows=[...(match.goals||[]).map(item=>({...item,event:'goal'})),...(match.bookings||[]).map(item=>({...item,event:'booking'})),...(match.substitutions||[]).map(item=>({...item,event:'substitution'}))].sort((a,b)=>(Number(a.minute)||999)-(Number(b.minute)||999)||(Number(a.injuryTime)||0)-(Number(b.injuryTime)||0));
    const events=eventRows.length?eventRows.map(item=>`<div class="match-event"><time>${item.minute==null?'—':minuteLabel(item)}</time><span>${item.event==='booking'?(item.card==='RED_CARD'?'Espulsione':'Ammonizione'):item.event==='substitution'?'Sostituzione':item.type==='PENALTY'?'Rigore':item.type==='OWN_GOAL'?'Autogol':'Gol'} · ${escapeHtml(item.event==='substitution'?`${item.player} per ${item.replacedPlayer}`:item.player)}</span><span>${escapeHtml(item.team||'')}</span></div>`).join(''):`<p class="match-empty">${match.status==='scheduled'?'La cronologia sarà disponibile dopo la partita.':'Cronologia eventi non disponibile.'}</p>`;
    const renderLineup=(players,formation)=>players.length?`<p class="match-empty">${formation?`Modulo ${escapeHtml(formation)} · `:''}${players.length} calciatori</p><div class="lineup-list">${players.map(player=>`<div class="lineup-player"><span>${escapeHtml(player.name||'')}</span><span>${escapeHtml(player.position||'')}</span></div>`).join('')}</div>`:`<p class="match-empty">Formazione non ancora disponibile.</p>`;
    root.innerHTML=`<p class="page-kicker">${escapeHtml(match.competition)}${round}</p><h1>${escapeHtml(match.home)} – ${escapeHtml(match.away)}</h1><section class="match-summary" aria-label="Riepilogo partita"><div class="match-meta">${escapeHtml(match.competition)}${round}</div><div class="match-scoreline"><strong>${escapeHtml(match.home)}</strong><div class="match-score">${score}</div><strong>${escapeHtml(match.away)}</strong></div><p class="match-status">${escapeHtml(cleanStatus(match.status))}</p><div class="match-facts"><span>${escapeHtml(formatDate(match.date))}</span>${match.venue?`<span>${escapeHtml(match.venue)}</span>`:''}${match.broadcaster?`<span>Diretta ${escapeHtml(match.broadcaster)}</span>`:''}</div></section><div class="match-content-grid"><section><h2>Eventi</h2><div class="match-timeline">${events}</div></section><section><h2>Marcatori</h2><p class="match-empty">${escapeHtml(match.scorers||'Nessun marcatore disponibile.')}</p>${match.mvp?`<p class="match-source">MVP ICV: <strong>${escapeHtml(match.mvp)}</strong></p>`:''}</section><section><h2>${escapeHtml(match.home)}</h2>${renderLineup(match.homeLineup||[],match.homeFormation)}</section><section><h2>${escapeHtml(match.away)}</h2>${renderLineup(match.awayLineup||[],match.awayFormation)}</section></div>${match.sourceUrl?`<p class="match-source">Fonte dati: <a href="${escapeHtml(match.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(match.source||'Apri la fonte')}</a></p>`:''}`;
    root.setAttribute('aria-busy','false');
  }
  async function loadMatch(){
    const root=document.getElementById('matchDetail');if(!root)return;
    const params=new URLSearchParams(location.search),id=params.get('match_id'),date=params.get('date');
    if(!id&&!date){root.innerHTML='<p class="match-empty">Link partita incompleto. Apri il calendario per scegliere un incontro.</p>';root.setAttribute('aria-busy','false');return;}
    const query=id?'match_id='+encodeURIComponent(id):'date='+encodeURIComponent(date)+(params.get('home')?'&home='+encodeURIComponent(params.get('home')):'')+(params.get('away')?'&away='+encodeURIComponent(params.get('away')):'');
    try{const response=await fetch('/api/public/match?'+query,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error('Dettaglio partita non disponibile. Puoi tornare al calendario e riprovare.');const match=await response.json();renderMatch(match);loadContents(query,match);}
    catch(error){root.innerHTML=`<div class="page-error"><p class="match-empty">${escapeHtml(error.message||'Referto non disponibile.')}</p><p style="margin-top:12px"><a class="match-primary-link" href="/calendario-juventus">Apri il calendario</a></p></div>`;root.setAttribute('aria-busy','false');}
  }
  function loadContents(query,match){
    const extras=document.getElementById('matchExtras');if(!extras)return;
    extras.hidden=false;
    const status=document.getElementById('matchContentStatus'),retry=document.getElementById('matchContentRetry');
    const roomLink=document.getElementById('matchRoomLink');roomLink.href='/community?'+query;
    async function run(){
      retry.hidden=true;status.textContent='Caricamento dei contenuti...';
      try{
        const response=await fetch('/api/public/match-content?'+query,{headers:{Accept:'application/json'}});
        if(!response.ok)throw new Error();
        const data=await response.json(),conferences=data.conferences||[],albums=data.albums||[];
        window.ICVHighlights?.render(data.highlights||null);
        window.ICVConference?.render(conferences[0]||null,conferences.slice(1));
        document.getElementById('matchVideosEmpty').hidden=!!data.highlights||conferences.length>0;
        document.getElementById('matchPhotosEmpty').hidden=albums.length>0;
        const select=document.getElementById('matchAlbumSelect');select.replaceChildren();
        albums.forEach((album,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=album.title;select.appendChild(option);});
        select.onchange=()=>window.ICVGallery?.render(albums[Number(select.value)]);
        document.getElementById('matchAlbumLabel').hidden=albums.length<2;
        window.ICVGallery?.render(albums[0]||null);
        status.textContent=data.partial?'Alcuni contenuti non sono raggiungibili. Puoi riprovare.':'';retry.hidden=!data.partial;
        if(data.community_key||match.community_key){
          const room=await fetch('/api/community/match-room?match_key='+encodeURIComponent(data.community_key||match.community_key));
          if(!room.ok)throw new Error('room');
          const messages=(await room.json()).messages||[],box=document.getElementById('matchMessages');
          box.innerHTML=messages.length?messages.slice(-5).map(item=>`<article class="match-message-preview"><strong>${escapeHtml(item.author?.display_name||item.author?.username||'Tifoso ICV')}</strong><p>${escapeHtml(item.body)}</p><time>${escapeHtml(formatDate(item.created_at))}</time></article>`).join(''):'<p class="match-empty">Nessun messaggio per questo incontro. Apri la Match Room per partecipare.</p>';
        }else document.getElementById('matchMessages').textContent='La discussione non e ancora disponibile per questo incontro.';
      }catch(error){status.textContent=error.message==='room'?'Discussione temporaneamente non disponibile.':'Contenuti temporaneamente non disponibili.';retry.hidden=false;}
    }
    retry.addEventListener('click',run);
    if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();run();}},{rootMargin:'200px'});observer.observe(extras);}else run();
  }
  loadSearch();loadMatch();
})();
