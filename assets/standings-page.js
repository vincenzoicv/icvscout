(function(){
  'use strict';
  const european=new URLSearchParams(location.search).get('competizione')==='europa-league';
  const competition=european?'EL':'SA';
  document.querySelector('[data-competition="'+competition+'"]').setAttribute('aria-current','page');
  document.getElementById('competitionTitle').textContent=european?'Europa League':'Serie A';
  document.getElementById('statsLink').hidden=european;
  const body=document.getElementById('standingsRows'),status=document.getElementById('standingsStatus'),error=document.getElementById('standingsError');
  function cell(text,cls){const el=document.createElement('td');el.textContent=text;if(cls)el.className=cls;return el;}
  async function load(){
    error.hidden=true;status.hidden=false;status.textContent='Caricamento classifica...';document.getElementById('standingsContent').hidden=true;
    try{
      const response=await fetch('/api/public/standings?competition='+competition);
      if(!response.ok)throw new Error();const data=await response.json();
      if(!Array.isArray(data.table)||!data.table.length)throw new Error();
      body.replaceChildren();
      for(const row of data.table){
        const tr=document.createElement('tr');
        if(row.isJuventus)tr.classList.add('juventus');
        if(!data.preseason){
          const pos=row.position;
          if(pos<=(european?8:4))tr.classList.add('zone-top');
          else if(pos<=(european?24:6))tr.classList.add('zone-middle');
          else if(!european && pos>=18)tr.classList.add('zone-bottom');
        }
        tr.append(cell(data.preseason?'\u2014':row.position));
        const team=document.createElement('th');team.scope='row';team.className='team-cell';
        const name=document.createElement('span');name.className='team-name';
        if(/^https:\/\/(crests\.football-data\.org|img\.uefa\.com)\//.test(row.team.crest)){
          const image=document.createElement('img');image.src=row.team.crest;image.alt='';image.width=28;image.height=28;image.loading='lazy';image.addEventListener('error',()=>{image.style.visibility='hidden';});name.append(image);
        }
        const label=document.createElement('span');label.textContent=row.team.name;name.append(label);team.append(name);tr.append(team);
        for(const [key,cls] of [['playedGames',''],['won','detail-column'],['draw','detail-column'],['lost','detail-column'],['goalsFor','detail-column'],['goalsAgainst','detail-column'],['goalDifference',''],['points','points']])tr.append(cell(key==='goalDifference'&&row[key]>0?'+'+row[key]:row[key],cls));
        body.append(tr);
      }
      document.getElementById('standingsCaption').textContent=data.preseason?'Fase campionato non ancora iniziata. Squadre in ordine alfabetico.':'Stagione '+data.season+' \u00b7 '+data.table.length+' squadre';
      const legend=document.getElementById('standingsLegend');legend.replaceChildren();
      for(const [cls,text] of (european?[['top','1-8: ottavi di finale'],['middle','9-24: spareggi'],['bottom','25-36: eliminate']]:[['top','1-4: zona Champions League'],['middle','5-6: zona Europa'],['bottom','18-20: retrocessione']])){const item=document.createElement('span');item.className=cls;item.textContent=text;legend.append(item);}
      document.getElementById('standingsCaveat').textContent=european?'':'Posti europei indicativi: dipendono anche dalle coppe e da eventuali posti aggiuntivi.';
      const source=document.getElementById('standingsSource');source.href=data.source;source.textContent=european?'UEFA':'Lega Serie A';
      status.textContent='';status.hidden=true;
      document.getElementById('standingsContent').hidden=false;
    }catch{status.textContent='';status.hidden=true;error.hidden=false;}
  }
  document.getElementById('standingsRetry').addEventListener('click',load);load();
})();
