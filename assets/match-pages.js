(function(){
  'use strict';
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const formatDate=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'}).format(date):'Data da confermare';};
  const cleanStatus=status=>({finished:'Finale',awarded:'Omologata',live:'In corso',in_play:'In corso',paused:'Intervallo',halftime:'Intervallo',scheduled:'In programma',timed:'In programma',pre_match:'In programma',postponed:'Rinviata',cancelled:'Annullata',suspended:'Sospesa'}[String(status||'').toLowerCase()]||status||'');
  const minuteLabel=item=>item.minute==null?'Minuto non disponibile':item.injuryTime?`${item.minute}+${item.injuryTime}'`:`${item.minute}'`;
  const isFinal=match=>['finished','awarded'].includes(String(match.status||'').toLowerCase());
  const isUpcoming=match=>['scheduled','timed','pre_match'].includes(String(match.status||'').toLowerCase());
  const positionLabel=value=>{
    const key=String(value||'').trim().toLowerCase().replace(/[_-]/g,' ').replace(/\s+/g,' ');
    return ({goalkeeper:'Portiere',keeper:'Portiere',defence:'Difensore',defender:'Difensore','centre back':'Difensore centrale','center back':'Difensore centrale','left back':'Terzino sinistro','right back':'Terzino destro',midfield:'Centrocampista',midfielder:'Centrocampista','central midfield':'Centrocampista centrale','defensive midfield':'Mediano','attacking midfield':'Trequartista','left midfield':'Esterno sinistro','right midfield':'Esterno destro','left winger':'Ala sinistra','right winger':'Ala destra',offence:'Attaccante',attack:'Attaccante',forward:'Attaccante',striker:'Centravanti','centre forward':'Centravanti','center forward':'Centravanti'})[key]||'Ruolo non specificato';
  };
  function renderEvent(item){
    const red=['RED_CARD','YELLOW_RED_CARD','SECOND_YELLOW_CARD'].includes(String(item.card||'').toUpperCase());
    const kind=item.event==='booking'?(red?'red':'yellow'):item.event;
    const label=item.event==='booking'?(red?'Espulsione':'Ammonizione'):item.event==='substitution'?'Sostituzione':item.type==='PENALTY'?'Gol su rigore':item.type==='OWN_GOAL'?'Autogol':'Gol';
    const icon=item.event==='booking'?'rectangle-vertical':item.event==='substitution'?'arrow-right-left':'circle-dot';
    const players=item.event==='substitution'?`<span class="match-change"><span>Entra <strong>${escapeHtml(item.player||'Giocatore non disponibile')}</strong></span><span>Esce <strong>${escapeHtml(item.replacedPlayer||'Giocatore non disponibile')}</strong></span></span>`:`<strong>${escapeHtml(item.player||'Giocatore non disponibile')}</strong>`;
    return `<li class="match-event match-event--${kind}"><span class="match-minute">${escapeHtml(minuteLabel(item))}</span><span class="match-event-icon" aria-hidden="true"><i data-lucide="${icon}"></i></span><div class="match-event-copy"><span class="match-event-label">${label}</span>${players}${item.team?`<span class="match-event-team">${escapeHtml(item.team)}</span>`:''}</div></li>`;
  }
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
    document.title=`${match.home} – ${match.away} · Il Calcio di Vince`;
    const score=match.homeScore!=null&&match.awayScore!=null?`${match.homeScore} – ${match.awayScore}`:'–';
    const round=match.roundLabel?` · ${escapeHtml(match.roundLabel)}`:match.matchday?` · ${escapeHtml(match.matchday)}ª giornata`:'';
    const eventRows=[...(match.goals||[]).map(item=>({...item,event:'goal'})),...(match.bookings||[]).map(item=>({...item,event:'booking'})),...(match.substitutions||[]).map(item=>({...item,event:'substitution'}))].sort((a,b)=>(a.minute==null?Infinity:Number(a.minute))-(b.minute==null?Infinity:Number(b.minute))||(Number(a.injuryTime)||0)-(Number(b.injuryTime)||0));
    const events=eventRows.length?`<ol class="match-event-list" aria-label="Cronologia della partita">${eventRows.map(renderEvent).join('')}</ol>`:`<p class="match-empty">${isUpcoming(match)?'La partita non è ancora iniziata.':isFinal(match)?'La fonte non fornisce la cronologia di questa partita.':'Nessun evento disponibile al momento.'}</p>`;
    const renderLineup=(players,formation)=>players.length?`<div class="lineup-meta">${formation?`<span>Modulo <strong>${escapeHtml(formation)}</strong></span>`:''}<span>${players.length} calciatori</span></div><ul class="lineup-list">${players.map(player=>`<li class="lineup-player"><strong>${escapeHtml(player.name||'')}</strong><span>${escapeHtml(positionLabel(player.position))}</span></li>`).join('')}</ul>`:`<p class="match-empty">${isFinal(match)?'La fonte non fornisce la formazione di questa partita.':isUpcoming(match)?'Formazione ufficiale non ancora disponibile.':'Formazione non disponibile al momento.'}</p>`;
    const scorers=match.scorers||eventRows.filter(item=>item.event==='goal').map(item=>`${item.player||'Giocatore non disponibile'} ${minuteLabel(item)}${item.type==='OWN_GOAL'?' (autogol)':item.type==='PENALTY'?' (rigore)':''}`).join(' · ')||(isFinal(match)&&match.homeScore===0&&match.awayScore===0?'Nessuna rete.':isFinal(match)?'La fonte non fornisce i marcatori di questa partita.':isUpcoming(match)?'La partita non è ancora iniziata.':'Nessun marcatore disponibile al momento.');
    root.innerHTML=`<p class="page-kicker">${escapeHtml(match.competition)}${round}</p><h1>${escapeHtml(match.home)} – ${escapeHtml(match.away)}</h1><section class="match-summary" aria-label="Riepilogo partita"><div class="match-meta">${escapeHtml(match.competition)}${round}</div><div class="match-scoreline"><strong>${escapeHtml(match.home)}</strong><div class="match-score">${score}</div><strong>${escapeHtml(match.away)}</strong></div><p class="match-status">${escapeHtml(cleanStatus(match.status))}</p><div class="match-facts"><span>${escapeHtml(formatDate(match.date))}</span>${match.venue?`<span>${escapeHtml(match.venue)}</span>`:''}${match.broadcaster?`<span>Diretta ${escapeHtml(match.broadcaster)}</span>`:''}</div></section><div class="match-content-grid"><section><h2>Cronologia</h2><div class="match-timeline">${events}</div></section><section><h2>Marcatori</h2><p class="match-empty">${escapeHtml(scorers)}</p>${match.mvp?`<p class="match-source">MVP ICV: <strong>${escapeHtml(match.mvp)}</strong></p>`:''}</section><section><h2>${escapeHtml(match.home)}</h2>${renderLineup(match.homeLineup||[],match.homeFormation)}</section><section><h2>${escapeHtml(match.away)}</h2>${renderLineup(match.awayLineup||[],match.awayFormation)}</section></div>${match.sourceUrl?`<p class="match-source">Fonte dati: <a href="${escapeHtml(match.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(match.source||'Apri la fonte')}</a></p>`:''}`;
    window.lucide?.createIcons();
    root.setAttribute('aria-busy','false');
  }
  async function loadMatch(){
    const root=document.getElementById('matchDetail');if(!root)return;
    const retrying=document.activeElement?.id==='matchRetry';
    root.setAttribute('aria-busy','true');
    root.innerHTML='<div class="loading" role="status">Caricamento del referto…</div>';
    const params=new URLSearchParams(location.search),id=params.get('match_id'),date=params.get('date');
    if(!id&&!date){root.innerHTML='<p class="match-empty">Link partita incompleto. Apri il calendario per scegliere un incontro.</p>';root.setAttribute('aria-busy','false');return;}
    const query=id?'match_id='+encodeURIComponent(id):'date='+encodeURIComponent(date)+(params.get('home')?'&home='+encodeURIComponent(params.get('home')):'')+(params.get('away')?'&away='+encodeURIComponent(params.get('away')):'');
    try{const response=await fetch('/api/public/match?'+query,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error('Dettaglio partita non disponibile. Puoi tornare al calendario e riprovare.');const match=await response.json();renderMatch(match);loadContents(query,match);}
    catch(error){root.innerHTML='<div class="page-error"><h2>Referto temporaneamente non disponibile</h2><p class="match-empty">Il caricamento non è riuscito. Riprova oppure scegli un incontro dal calendario.</p><div class="match-error-actions"><button class="match-primary-link" id="matchRetry" type="button"><i data-lucide="rotate-cw" aria-hidden="true"></i>Riprova</button><a href="/calendario-juventus">Apri il calendario</a></div></div>';root.setAttribute('aria-busy','false');window.lucide?.createIcons();document.getElementById('matchRetry').addEventListener('click',loadMatch);}
    if(retrying){const target=document.getElementById('matchRetry')||root;if(target===root)target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}
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
