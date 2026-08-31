(function(){
  'use strict';
  const sections=[...document.querySelectorAll('[data-media-section]')],filters=[...document.querySelectorAll('[data-filter]')];
  function filter(){
    const value=location.hash.slice(1),active=filters.some(item=>item.dataset.filter===value)?value:'tutti';
    for(const item of filters)item.setAttribute('aria-pressed',String(item.dataset.filter===active));
    for(const section of sections)section.hidden=active!=='tutti' && section.dataset.mediaSection!==active;
  }
  for(const item of filters)item.addEventListener('click',()=>{location.hash=item.dataset.filter;});
  window.addEventListener('hashchange',filter);filter();
  async function load(){
    document.getElementById('mediaError').hidden=true;document.getElementById('mediaStatus').textContent='Caricamento contenuti...';
    try{
      const response=await fetch('/api/public/media',{cache:'no-store'});if(!response.ok)throw new Error();const data=await response.json();
      if(!Array.isArray(data.conferences)||!Array.isArray(data.albums))throw new Error();
      window.ICVConference.render(data.conferences[0],data.conferences.slice(1));
      document.getElementById('noConferences').hidden=data.conferences.length>0;
      const grid=document.getElementById('albumList');grid.replaceChildren();
      for(const album of data.albums){
        if(!album.photos?.length)continue;
        const button=document.createElement('button'),image=document.createElement('img'),title=document.createElement('strong'),date=document.createElement('time');
        button.type='button';button.className='album-card';button.setAttribute('aria-label','Apri album '+album.title);button.setAttribute('aria-controls','matchGallery');
        image.src=album.photos[0].url;image.alt=album.photos[0].caption || album.title;image.width=640;image.height=480;image.loading='lazy';image.decoding='async';
        title.textContent=album.title;date.dateTime=album.date;date.textContent=new Date(album.date+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'})+' \u00b7 '+album.photos.length+' foto';
        button.append(image,title,date);button.addEventListener('click',()=>{window.ICVGallery.render(album);const heading=document.getElementById('matchGalleryHeading');heading.tabIndex=-1;heading.focus({preventScroll:true});heading.scrollIntoView({block:'start'});});grid.append(button);
      }
      document.getElementById('noAlbums').hidden=grid.childElementCount>0;
      document.getElementById('mediaStatus').textContent='';filter();
    }catch{document.getElementById('mediaStatus').textContent='';document.getElementById('mediaError').hidden=false;}
  }
  document.getElementById('mediaRetry').addEventListener('click',load);load();
})();
