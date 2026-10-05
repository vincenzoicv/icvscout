(function(){
  'use strict';
  const root=document.getElementById('videoAdmin');if(!root)return;
  const el=id=>document.getElementById(id),form=el('videoUploadForm');let state=null,busy=false,loaded=false;
  const option=document.createElement('option');option.value='videos';option.textContent='Interviste e video';el('adminSection').append(option);
  function origin(){const social=el('videoOrigin').value==='social';root.querySelectorAll('[data-video-file]').forEach(label=>{label.hidden=social;label.querySelector('input').disabled=social;});el('videoFile').required=!social;el('videoLinkField').hidden=!social;el('videoLink').required=social;}
  el('videoOrigin').addEventListener('change',origin);origin();
  function notice(text,error=false){el('videoAdminStatus').textContent=text;el('videoAdminStatus').dataset.error=String(error);}
  function lock(value){busy=value;el('videoUploadFields').disabled=value||!state;el('videoRefresh').disabled=value;root.querySelectorAll('[data-video-action]').forEach(button=>button.disabled=value);}
  async function refresh(){state=await api('/api/admin/videos');loaded=true;render();}
  async function open(){if(busy)return;lock(true);notice('Caricamento archivio...');try{await refresh();notice('');}catch(error){notice(error.message,true);}finally{lock(false);}}
  function button(icon,label,action){const element=document.createElement('button');element.type='button';element.dataset.videoAction=action;element.title=label;const glyph=document.createElement('i');glyph.dataset.lucide=icon;glyph.setAttribute('aria-hidden','true');element.append(glyph,document.createTextNode(label));return element;}
  function render(){
    const list=el('videoAdminList');list.querySelectorAll('video').forEach(v=>v.pause());list.replaceChildren();
    el('videoSpace').textContent=(state.used_bytes/1048576).toFixed(1)+' / '+(state.archive_limit/1048576)+' MB';
    el('videoAdminEmpty').hidden=state.videos.length>0;
    for(const item of [...state.videos].reverse()){
      const section=document.createElement('article');section.className='video-admin-item';
      const status=document.createElement('strong');status.textContent=item.deleted?'Eliminazione da completare':item.uploading?'Caricamento incompleto':item.published?'Pubblicato':'Bozza';section.append(status);
      if(item.source_url){const source=document.createElement('p');source.textContent=(item.kind==='tiktok'?'TikTok':'Instagram')+' · '+item.source_url;section.append(source);}
      const titleLabel=document.createElement('label');titleLabel.textContent='Titolo';const title=document.createElement('input');title.value=item.title;title.maxLength=160;title.required=true;titleLabel.append(title);
      const descriptionLabel=document.createElement('label');descriptionLabel.textContent='Descrizione';const description=document.createElement('textarea');description.value=item.description;description.maxLength=1200;descriptionLabel.append(description);
      section.append(titleLabel,descriptionLabel);
      if(item.source_url&&!item.deleted){const preview=document.createElement('div');window.ICVVideos?.render(preview,[{...item,url:null}]);section.append(preview);}
      if(!item.deleted&&!item.source_url&&!item.uploading){const preview=document.createElement('button');preview.type='button';preview.textContent='Anteprima';preview.dataset.videoAction='preview';preview.addEventListener('click',async()=>{
        if(busy)return;lock(true);notice('Caricamento anteprima...');
        try{const response=await fetch('/api/admin/video-file?id='+item.id,{headers:{'X-ICV-Admin-Token':token()},cache:'no-store'});if(!response.ok)throw new Error('Anteprima non disponibile');const url=URL.createObjectURL(await response.blob());const video=document.createElement('video');video.controls=true;video.preload='metadata';video.playsInline=true;video.src=url;video.setAttribute('aria-label',item.title);video.dataset.blob=url;section.insertBefore(video,preview);preview.remove();notice('');}catch(error){notice(error.message,true);}finally{lock(false);}
      });section.append(preview);}
      const actions=document.createElement('div');actions.className='video-admin-actions';
      if(!item.deleted&&!item.uploading){
        const save=button('save','Salva','save'),publish=button(item.published?'eye-off':'eye',item.published?'Nascondi':'Pubblica','publish');
        save.addEventListener('click',()=>change(item,{title:title.value,description:description.value}));
        publish.addEventListener('click',()=>change(item,{title:title.value,description:description.value,published:!item.published}));actions.append(save,publish);
      }
      const remove=button('trash-2',item.deleted?'Riprova eliminazione':'Elimina','delete');remove.addEventListener('click',()=>{if(confirm('Eliminare il video "'+item.title+'" e i suoi file?'))change(item,{},'DELETE');});actions.append(remove);section.append(actions);list.append(section);
    }
    window.lucide?.createIcons();
  }
  async function change(item,values,method='PATCH'){
    if(busy||!state)return;lock(true);notice('Salvataggio...');
    try{await api('/api/admin/videos',{method,body:{...values,id:item.id,revision:state.revision}});await refresh();notice(method==='DELETE'?'Video eliminato.':'Video salvato.');}
    catch(error){notice(error.message,true);try{await refresh();}catch{state=null;}}finally{lock(false);}
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!state)return;
    const social=el('videoOrigin').value==='social';
    const file=el('videoFile').files[0],cover=el('videoCover').files[0],captions=el('videoCaptions').files[0];
    if(!social&&(!file||file.type!=='video/mp4'||file.size>state.max_bytes)){notice('Scegli un MP4 di massimo 50 MB.',true);return;}
    if(!social&&cover&&(cover.type!=='image/jpeg'||cover.size>2097152)){notice('La copertina deve essere JPG, massimo 2 MB.',true);return;}
    if(!social&&captions&&captions.size>32768){notice('Sottotitoli: massimo 32 KB.',true);return;}
    const values=new FormData(form),data={title:values.get('title'),description:values.get('description'),revision:state.revision,rights:el('videoRights').checked};
    lock(true);notice('Caricamento in corso...');const progress=el('videoProgress');progress.hidden=false;progress.value=0;
    try{
      if(social){data.source_url=el('videoLink').value.trim();await api('/api/admin/videos',{method:'POST',body:data});}
      else{
      data.video_size=file.size;data.cover_size=cover?.size||0;data.captions=captions?await captions.text():'';
      const ticket=await api('/api/admin/videos',{method:'POST',body:data});
      for(const [asset,body] of [['video',file],...(cover?[['cover',cover]]:[])]){
      await new Promise((resolve,reject)=>{
        const xhr=new XMLHttpRequest();xhr.open('PUT','/api/admin/videos?id='+ticket.id+'&asset='+asset);xhr.setRequestHeader('X-ICV-Admin-Token',token());xhr.setRequestHeader('Content-Type',body.type);xhr.timeout=300000;
        xhr.upload.onprogress=event=>{if(event.lengthComputable)progress.value=Math.round(event.loaded/event.total*100);};
        xhr.onload=()=>{let result;try{result=JSON.parse(xhr.responseText);}catch{reject(new Error('Risposta non valida. Aggiorna l\'archivio prima di riprovare.'));return;}xhr.status>=200&&xhr.status<300?resolve(result):reject(new Error(result.error||'Caricamento non riuscito'));};
        xhr.onerror=xhr.ontimeout=()=>reject(new Error('Connessione interrotta. Elimina la bozza incompleta e riprova.'));xhr.send(body);
      });
      }
      await refresh();await api('/api/admin/videos',{method:'PATCH',body:{id:ticket.id,revision:state.revision,complete:true}});
      }
      form.reset();origin();await refresh();notice('Video aggiunto in bozza.');
    }catch(error){notice(error.message,true);try{await refresh();}catch{state=null;}}
    finally{progress.hidden=true;lock(false);}
  });
  el('videoRefresh').addEventListener('click',open);
  window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
  const observer=new MutationObserver(records=>records.forEach(record=>record.removedNodes.forEach(node=>{if(node.nodeType===1)node.querySelectorAll('video[data-blob]').forEach(video=>URL.revokeObjectURL(video.dataset.blob));})));observer.observe(el('videoAdminList'),{childList:true});
  window.ICVVideoAdmin={open:()=>{if(!loaded)open();}};lock(false);
  new MutationObserver(()=>{if(!root.classList.contains('active'))root.querySelectorAll('video').forEach(video=>video.pause());}).observe(root,{attributes:true,attributeFilter:['class']});
})();
