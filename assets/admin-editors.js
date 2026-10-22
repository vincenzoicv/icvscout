(function(){
  'use strict';
  const groups={
    highlights:{label:'Highlights',ids:['highlightsMode','highlightsTitle','highlightsUrl','highlightsMatchDate']},
    conference:{label:'Sala stampa',ids:['conferenceMode','conferencePost','conferenceManualPhase']},
    match:{label:'Match Center',ids:['matchOverrideId','matchOverrideStatus','matchOverrideMinute','matchOverrideHomeScore','matchOverrideAwayScore','matchOverrideScorers','matchOverrideMvp','matchOverrideWorst','matchOverrideNote']},
    news:{label:'News manuale',ids:['manualCategory','manualTitle','manualBody','manualSource']}
  };
  const saved=new Map();
  function snapshot(key){return JSON.stringify(groups[key].ids.map(id=>document.getElementById(id)?.value||''));}
  function dirty(key){return saved.has(key)&&saved.get(key)!==snapshot(key);}
  function update(){
    const names=Object.keys(groups).filter(dirty).map(key=>groups[key].label);
    const notice=document.getElementById('adminUnsavedStatus');
    if(notice){notice.hidden=!names.length;notice.textContent=names.length?'Modifiche non salvate: '+names.join(', ')+'.':'';}
  }
  function mark(key){saved.set(key,snapshot(key));update();}
  window.ICVAdminEditors={dirty,mark,snapshot,accept(key,submitted){saved.set(key,submitted);update();},update,
    confirmLeave(){
      if(!Object.keys(groups).some(dirty))return true;
      if(!confirm('Uscire e perdere le modifiche non salvate?'))return false;
      Object.keys(groups).forEach(mark);return true;
    }
  };
  document.addEventListener('input',update);
  document.addEventListener('change',update);
  window.addEventListener('beforeunload',event=>{
    if(Object.keys(groups).some(dirty)){event.preventDefault();event.returnValue='';}
  });
  Object.keys(groups).forEach(mark);
})();
