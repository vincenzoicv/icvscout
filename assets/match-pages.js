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
    const eventRows=[...(match.goals||[]).map(item=>({...item,event:'goal'})),...(match.bookings||[]).map(item=>({...item,event:'booking'}))].sort((a,b)=>(Number(a.minute)||999)-(Number(b.minute)||999)||(Number(a.injuryTime)||0)-(Number(b.injuryTime)||0));
    const events=eventRows.length?eventRows.map(item=>`<div class="match-event"><time>${item.minute==null?'—':minuteLabel(item)}</time><span>${item.event==='booking'?(item.card==='RED_CARD'?'Espulsione':'Ammonizione'):item.type==='PENALTY'?'Rigore':item.type==='OWN_GOAL'?'Autogol':'Gol'} · ${escapeHtml(item.player)}</span><span>${escapeHtml(item.team||'')}</span></div>`).join(''):`<p class="match-empty">${match.status==='scheduled'?'La cronologia sarà disponibile dopo la partita.':'Cronologia eventi non disponibile.'}</p>`;
    const renderLineup=(players,formation)=>players.length?`<p class="match-empty">${formation?`Modulo ${escapeHtml(formation)} · `:''}${players.length} calciatori</p><div class="lineup-list">${players.map(player=>`<div class="lineup-player"><span>${escapeHtml(player.name||'')}</span><span>${escapeHtml(player.position||'')}</span></div>`).join('')}</div>`:`<p class="match-empty">Formazione non ancora disponibile.</p>`;
    root.innerHTML=`<p class="page-kicker">${escapeHtml(match.competition)}${round}</p><h1>${escapeHtml(match.home)} – ${escapeHtml(match.away)}</h1><section class="match-summary" aria-label="Riepilogo partita"><div class="match-meta">${escapeHtml(match.competition)}${round}</div><div class="match-scoreline"><strong>${escapeHtml(match.home)}</strong><div class="match-score">${score}</div><strong>${escapeHtml(match.away)}</strong></div><p class="match-status">${escapeHtml(cleanStatus(match.status))}</p><div class="match-facts"><span>${escapeHtml(formatDate(match.date))}</span>${match.venue?`<span>${escapeHtml(match.venue)}</span>`:''}${match.broadcaster?`<span>Diretta ${escapeHtml(match.broadcaster)}</span>`:''}</div></section><div class="match-content-grid"><section><h2>Eventi</h2><div class="match-timeline">${events}</div></section><section><h2>Marcatori</h2><p class="match-empty">${escapeHtml(match.scorers||'Nessun marcatore disponibile.')}</p>${match.mvp?`<p class="match-source">MVP ICV: <strong>${escapeHtml(match.mvp)}</strong></p>`:''}</section><section><h2>${escapeHtml(match.home)}</h2>${renderLineup(match.homeLineup||[],match.homeFormation)}</section><section><h2>${escapeHtml(match.away)}</h2>${renderLineup(match.awayLineup||[],match.awayFormation)}</section></div>${match.sourceUrl?`<p class="match-source">Fonte dati: <a href="${escapeHtml(match.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(match.source||'Apri la fonte')}</a></p>`:''}`;
    root.setAttribute('aria-busy','false');
  }
  async function loadMatch(){
    const root=document.getElementById('matchDetail');if(!root)return;
    const params=new URLSearchParams(location.search),id=params.get('match_id'),date=params.get('date');
    if(!id&&!date){root.innerHTML='<p class="match-empty">Link partita incompleto. Apri il calendario per scegliere un incontro.</p>';root.setAttribute('aria-busy','false');return;}
    const query=id?'match_id='+encodeURIComponent(id):'date='+encodeURIComponent(date)+(params.get('home')?'&home='+encodeURIComponent(params.get('home')):'')+(params.get('away')?'&away='+encodeURIComponent(params.get('away')):'');
    try{const response=await fetch('/api/public/match?'+query,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error('Dettaglio partita non disponibile. Puoi tornare al calendario e riprovare.');renderMatch(await response.json());}
    catch(error){root.innerHTML=`<div class="page-error"><p class="match-empty">${escapeHtml(error.message||'Referto non disponibile.')}</p><p style="margin-top:12px"><a class="match-primary-link" href="/calendario-juventus">Apri il calendario</a></p></div>`;root.setAttribute('aria-busy','false');}
  }
  loadSearch();loadMatch();
})();
