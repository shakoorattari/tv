'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const seed = {categories:['Animation','Nature','Short films'],videos:[
 {id:'spring',title:'Spring',category:'Animation',url:'https://www.youtube.com/watch?v=WhWc3b3KhnY',art:'aurora',description:'Follow a shepherd girl and her dog through an ancient forest in this short film from Blender Studio.'},
 {id:'bunny',title:'Big Buck Bunny',category:'Short films',url:'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4',art:'coast',description:'An animated woodland comedy from the Blender Foundation.'},
 {id:'flower',title:'A moment in bloom',category:'Nature',url:'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',art:'bloom',description:'A close-up nature study from the MDN sample collection.'}]};
function withKids(catalog){
 const urls=new Set(catalog.videos.map(video=>video.url));
 const ids=new Set(catalog.videos.map(video=>video.id));
 const added=kidsCatalog.filter(video=>!ids.has(video.id)&&!urls.has(video.url));
 return {videos:[...added,...catalog.videos],categories:[...new Set([...added.map(video=>video.category),...catalog.categories])]};
}
Object.assign(seed,withKids(seed));
const key='strand.catalog.v2', pk='strand.profiles.v1';
function read(k,fallback){try{return JSON.parse(localStorage.getItem(k)) ?? fallback}catch{return fallback}}
function deviceLibrary(){
 const current=read(key,null);
 if(current)return current;
 const previous=read('strand.catalog.v1',null);
 return previous?withKids(previous):seed;
}
let sharedLibrary=window.STRAND_FIREBASE?read('strand.shared.v1',seed):deviceLibrary();
let personalLibrary={categories:[],videos:[]}, library=sharedLibrary, personalError='';
let profiles=read(pk,{active:'guest',items:[{id:'guest',name:'Guest'}]});
let filter='',user=null,isAdmin=false,cloud=null,cloudError='',ready=!window.STRAND_FIREBASE,dialogOrigin=null;
const isAndroid=navigator.userAgent.includes('StrandTVAndroid/');
const downloadLink = document.querySelector('.apk-download');
if (downloadLink && (isAndroid || AppInstall.apple)) downloadLink.hidden = true;
const main=$('#main'),modal=$('#modal'),body=$('#body');
const inPersonal=()=>Boolean(user && read('strand.library.view.'+user.uid,'shared')==='personal');
const owner=()=>user?'account:'+user.uid:'device:'+profiles.active;
let offline={config:{limit:500,auto:true},used:0,videos:[]},offlineBusy=false,offlineError='',offlineMessage='',offlineSettingsStatus=false;
function selectLibrary(view){
 if(!user)return;
 localStorage.setItem('strand.library.view.'+user.uid,JSON.stringify(view));
 library=inPersonal()?personalLibrary:sharedLibrary;
 filter='';
 render();
}
function source(raw){
 const u=new URL(raw); if(u.protocol!=='https:'||u.username||u.password)throw Error('Enter an HTTPS link without credentials.');
 const h=u.hostname,p=u.pathname,parts=p.split('/');let id;
 if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(h)){
 if(p==='/playlist' && /^[A-Za-z0-9_-]+$/.test(u.searchParams.get('list')||'')){
   return {name:'YouTube playlist',list:u.searchParams.get('list'),embed:'https://www.youtube-nocookie.com/embed/videoseries?autoplay=1&playsinline=1&rel=0&list='+u.searchParams.get('list')};
 }
 id=h==='youtu.be'?parts[1]:u.searchParams.get('v')||(['shorts','embed','live'].includes(parts[1])?parts[2]:'');
 if(!/^[\w-]{11}$/.test(id||''))throw Error('Enter a YouTube video link.');return {name:'YouTube',videoId:id,embed:'https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&playsinline=1&rel=0'};}
 if(h==='drive.google.com'&&(id=p.match(/\/file\/d\/([\w-]+)/)?.[1]||u.searchParams.get('id'))&&/^[\w-]+$/.test(id)){let v=new URL('https://drive.google.com/file/d/'+id+'/preview');if(u.searchParams.has('resourcekey'))v.searchParams.set('resourcekey',u.searchParams.get('resourcekey'));return {name:'Google Drive',embed:v.href}}
 if(/\.(mp4|webm)$/i.test(p))return {name:'Direct video',media:u.href};
 return {name:h==='1drv.ms'||h==='onedrive.live.com'||h.endsWith('.sharepoint.com')?'OneDrive':'Web link'};}
function cover(v){
 const id=youtubeVideoId(v.url);
 if(id && (v.art==='youtube' || v.coverMode!=='manual'))return 'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg';
 return './art/'+(['aurora','coast','bloom'].includes(v.art)?v.art:'aurora')+'.svg'}
function notice(s){$('#status').textContent=s;setTimeout(()=>{if($('#status').textContent===s)$('#status').textContent=''},4000)}
function show(title,html){if(!modal.open)dialogOrigin=document.activeElement;$('#modalTitle').textContent=title;body.innerHTML=html;if(!modal.open)modal.showModal();}
$('#close').onclick=()=>modal.close();modal.onclose=()=>{body.replaceChildren();if(dialogOrigin?.isConnected)dialogOrigin.focus();else document.querySelector('nav .active')?.focus()};
function render(){
 const page=['studio','library','offline','about'].includes(location.hash.slice(1))?location.hash.slice(1):'home';
 document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+page));
 const profile=user||profiles.items.find(p=>p.id===profiles.active)||profiles.items[0];
 const name=profile?.displayName||profile?.name||profile?.email||'Guest';
 $('#profile').textContent=name[0].toUpperCase();
 $('#profile').title=name;
 if(page==='studio')return studio();
 if(page==='about')return Releases.page(main);
 if(page==='offline')return offlinePage();
 const first=library.videos[0],videos=library.videos.filter(v=>!filter||v.category===filter);
 main.innerHTML=(page==='home'&&first?'<section class="hero" style="background-image:url('+cover(first)+')"><div><div class="eyebrow">◆ &nbsp; Featured film</div><h1>'+esc(first.title)+'</h1><p>'+esc(first.description)+'</p><button class="primary" data-play="'+esc(first.id)+'">▶ &nbsp; Watch now</button></div></section>':'<div class="page"><div class="eyebrow">Strand TV</div><h1>'+ (inPersonal()?'My library':'Video library') +'</h1></div>')+
 ((inPersonal()?personalError:cloudError)?'<p class="err">'+esc(inPersonal()?personalError:cloudError)+'</p>':'')+
 '<div class="bar"><h2>'+ (page==='home'?'Explore the collection':'Browse by category')+'</h2><span>'+videos.length+' titles</span></div><div class="filters">'+['',...library.categories].map(c=>'<button aria-pressed="'+(filter===c)+'" class="'+(filter===c?'active':'')+'" data-filter="'+esc(c)+'">'+esc(c||'All titles')+'</button>').join('')+'</div><div class="grid">'+videos.map(v=>'<button class="card" data-play="'+esc(v.id)+'"><div class="thumb"><img alt="" src="'+cover(v)+'"><span class="tag">'+esc(source(v.url).name)+'</span></div><strong>'+esc(v.title)+'</strong><small>'+esc(v.category)+'</small></button>').join('')+'</div>'+(!videos.length?'<p class="empty">No videos in this collection yet.</p>':'');
}
function play(id,origin,downloads=false){
 const selected=downloads?offline.videos.map(video=>({...video,id:video.key})):library.videos;
 const visible=selected.filter(v=>downloads||!filter||v.category===filter);
 const list=visible.some(v=>v.id===id)?visible:[selected.find(v=>v.id===id),...visible];
 if(!list[0])return;
 const entry=v=>{
  const s=source(v.url);
  const saved=downloads?v:offline.videos.find(item=>item.url===v.url);
  return {id:v.id,title:v.title,description:v.description,poster:cover(v),url:v.url,videoId:s.videoId,list:s.list,media:saved?.key||s.media,embed:s.embed,download:s.media&&!saved?v:null};
 };
 StrandPlayer.open({index:list.findIndex(v=>v.id===id),label:downloads?'Offline videos':filter||'All titles',items:list.map(entry),all:selected.map(entry),
  onPlay:entry=>{if(entry.download&&offline.config.limit&&offline.config.auto&&!offlineBusy&&navigator.onLine)offlineAction('save',downloadDetails(entry.download),true)},
  onClose:last=>{const target=[...main.querySelectorAll('[data-play],[data-offline-play]')].find(b=>(b.dataset.play||b.dataset.offlinePlay)===last)||(origin?.isConnected?origin:main.querySelector('[data-play]'));
   if(!target)return;target.focus({preventScroll:true});target.scrollIntoView({block:'center'})}});
}
function downloadDetails({id,title,url,category,art,description}) {
 return {id,title,url,category,art,description};
}
function availableOffline(){
 const saved=new Set(offline.videos.map(video=>video.url));
 return library.videos.filter(video=>source(video.url).media&&!saved.has(video.url));
}
function offlineRow(video,saved){
 const title=esc(video.title);
 const button=(action,value,label,primary=false)=>'<button type="button" '+(primary?'class="primary" ':'')+
  'data-offline-'+action+'="'+esc(value)+'" aria-label="'+label.replace('%s',()=>title)+'">'+
  ({save:'Save',play:'Play',remove:'Remove'})[action]+'</button>';
 return '<li class="offline-title" data-offline-row="'+esc(video.id)+'"><img src="'+cover(video)+'" alt="" loading="lazy">'+
  '<div class="offline-name"><strong>'+title+'</strong><small>'+esc(saved?formatMB(video.size)+' MB':video.category)+'</small></div>'+
  '<div class="offline-title-actions">'+(saved?button('play',video.key,'Play %s')+button('remove',video.key,'Remove %s from this device'):
   button('save',video.id,'Save %s for offline',true))+'</div></li>';
}
function formatMB(bytes){
 return new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(bytes/1e6);
}
function offlinePage(){
 if(!$('#offline-settings')){
  main.innerHTML=`<div class="offline-page">
   <section class="page"><h1>Offline videos</h1><p class="muted">Save direct MP4 and WebM videos to watch on this device without internet.</p></section>
   <div class="offline-layout">
    <div class="offline-collections">
     <p id="offline-status" role="status" aria-atomic="true"></p>
     <section class="offline-section" aria-labelledby="offline-saved-heading">
      <h2 id="offline-saved-heading">Saved videos</h2><div id="offline-saved"></div>
     </section>
     <section class="offline-section" aria-labelledby="offline-available-heading">
      <h2 id="offline-available-heading">Available to save</h2><div id="offline-available"></div>
     </section>
    </div>
    <aside class="offline-storage" aria-labelledby="offline-storage-heading">
     <h2 id="offline-storage-heading">Device storage</h2>
     <p id="offline-usage"></p>
     <progress id="offline-capacity" aria-label="Offline storage used"></progress>
     <form id="offline-settings">
      <label for="offline-limit">Storage limit (MB)</label>
      <input id="offline-limit" name="limit" type="text" inputmode="numeric" pattern="[0-9]+" required aria-describedby="offline-limit-help">
      <p id="offline-limit-help" class="offline-note">Oldest downloads are removed first when space runs out. A 0 MB limit clears downloads.</p>
      <label class="offline-check"><input id="offline-auto" name="auto" type="checkbox"> Automatically save compatible videos I play</label>
      <button id="offline-configure">Apply settings</button>
      <p id="offline-settings-status" role="status" aria-atomic="true"></p>
     </form>
    </aside>
   </div>
  </div>`;
  $('#offline-settings').onsubmit=e=>{
   e.preventDefault();
   const config={limit:Number($('#offline-limit').value),auto:$('#offline-auto').checked};
   offlineAction('configure',config);
  };
  $('#offline-settings').onkeydown=e=>{
   const controls=[$('#offline-limit'),$('#offline-auto'),$('#offline-configure')];
   if(e.target===controls[1]&&e.key==='Enter'){
    e.preventDefault();
    e.target.click();
   }
   const direction=e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0;
   const position=controls.indexOf(e.target);
   const next=controls[position+direction];
   if(direction&&position>=0&&next&&next.getAttribute('aria-disabled')!=='true'){
    e.preventDefault();
    e.stopPropagation();
    next.focus();
   }
  };
 }
 const {config,used,videos}=offline;
 const available=availableOffline();
 const focus=document.activeElement;
 const previous=focus.closest('[data-offline-row]')?.dataset.offlineRow;
 const lists=[
  ['#offline-saved',videos,true,'No saved videos yet. Save a title below to watch it offline.'],
  ['#offline-available',available,false,videos.length?'No other compatible videos in this library.':'This library has no direct MP4 or WebM videos to save.'],
 ];
 for(const [selector,entries,saved,empty] of lists){
  const section=$(selector);
  const html=entries.length?'<ul class="offline-list">'+entries.map(video=>offlineRow(video,saved)).join('')+'</ul>':
   '<p class="offline-empty">'+empty+'</p>';
  if(section.dataset.content!==html){
   section.innerHTML=html;
   section.dataset.content=html;
  }
 }
 const form=$('#offline-settings'),limit=$('#offline-limit'),auto=$('#offline-auto');
 if(!form.dataset.config||(!offlineBusy&&form.dataset.config!==JSON.stringify(config))){
  if(!form.dataset.config||limit.value===limit.defaultValue)limit.value=config.limit;
  if(!form.dataset.config||auto.checked===auto.defaultChecked)auto.checked=config.auto;
  limit.defaultValue=config.limit;
  auto.defaultChecked=config.auto;
  form.dataset.config=JSON.stringify(config);
 }
 const storage=$('#offline-capacity');
 storage.max=config.limit||1;
 storage.value=used/1e6;
 $('#offline-usage').textContent=formatMB(used)+' MB used of '+formatMB(config.limit*1e6)+' MB';
 const notice=offlineError||offlineMessage;
 const unavailable=config.limit===0?'Set a storage limit above 0 MB to save videos.':
  !navigator.onLine?'Connect to the internet to save more videos.':'';
 const status=$('#offline-status'),settingsStatus=$('#offline-settings-status');
 const listMessage=(!offlineSettingsStatus&&notice)||unavailable;
 const settingsMessage=offlineSettingsStatus?notice:'';
 if(status.textContent!==listMessage)status.textContent=listMessage;
 if(settingsStatus.textContent!==settingsMessage)settingsStatus.textContent=settingsMessage;
 status.classList.toggle('err',!offlineSettingsStatus&&Boolean(offlineError));
 settingsStatus.classList.toggle('err',offlineSettingsStatus&&Boolean(offlineError));
 $('#offline-configure').setAttribute('aria-disabled',String(offlineBusy));
 for(const button of document.querySelectorAll('[data-offline-save],[data-offline-remove]')){
  button.setAttribute('aria-disabled',String(offlineBusy||('offlineSave'in button.dataset&&(!config.limit||!navigator.onLine))));
 }
 if(previous&&!focus.isConnected){
  const same=[...main.querySelectorAll('[data-offline-row]')].find(row=>row.dataset.offlineRow===previous);
  const target=same?.querySelector('button[aria-disabled="false"],[data-offline-play]')||
   main.querySelector('[data-offline-play],[data-offline-save][aria-disabled="false"]')||limit;
  target.focus();
 }
}
async function offlineAction(action='list',value,quiet=false){
 const viewer=owner(),changing=action!=='list';
 if(changing&&offlineBusy)return;
 const label=value?.title||offline.videos.find(video=>video.key===value)?.title;
 const messages={
  configure:['Applying storage settings…','Storage settings updated.'],
  save:[label?'Saving “'+label+'”…':'Saving video…',label?'Saved “'+label+'” for offline.':'Video saved.'],
  remove:['Removing download…',label?'Removed “'+label+'” from this device.':'Download removed.'],
 };
 if(changing){
  offlineBusy=true;
  offlineError='';
  offlineSettingsStatus=action==='configure';
  offlineMessage=quiet?'':messages[action][0];
  if(location.hash==='#offline')offlinePage();
 }
 try{
  const next=await Offline.request(action,viewer,value);
  if(viewer===owner()){
   offline=next;
   if(changing&&!quiet)offlineMessage=messages[action][1];
  }
 }catch(err){
  if(viewer===owner()&&!quiet){
   offlineError=action==='save'&&err.message==='Failed to fetch'?
    'Couldn’t download this video. Check your connection or try another video.':err.message;
   if(!changing)offlineSettingsStatus=false;
   offlineMessage='';
  }
  if(action==='save')await Offline.request('list',viewer).then(next=>{if(viewer===owner())offline=next}).catch(()=>{});
 }finally{
  if(changing)offlineBusy=false;
  if(location.hash==='#offline'&&(viewer===owner()||changing))offlinePage();
 }
}
function row(name,type,id){return '<div class="row"><span>'+esc(name)+'</span><button data-edit="'+type+'" data-id="'+esc(id)+'">Edit</button><button data-remove="'+type+'" data-id="'+esc(id)+'">Remove</button></div>'}
function studio(){
 const local=!window.STRAND_FIREBASE,personal=inPersonal(),can=local||isAdmin||personal;
 const importable=personal&&(read(key,null)||read('strand.catalog.v1',null));
 main.innerHTML='<section class="page"><div class="eyebrow">Library management</div><h1>Studio</h1><p class="muted">'+(personal?(personalError?esc(personalError):'My library · Synced to your account'):local?'Device edition · Changes are saved in this browser.':cloudError||(!ready?'Connecting to Firebase…':isAdmin?'Shared library · Administrator':user?'This account has viewer access.':'Sign in with a library administrator account.'))+'</p></section>'+
 (!local&&cloud&&!user?'<button id="auth">Administrator sign-in</button>':'')+
 (user?'<div class="actions"><button id="catalogue-view">'+(personal?'Open shared library':'Open my library')+'</button>'+
 (importable?'<button id="import-catalogue">Import device library</button>':'')+'</div>':'')+
 (can?'<div class="bar"><h2>Videos</h2><button data-edit="video">Add video</button></div>'+library.videos.map(v=>row(v.title,'video',v.id)).join('')+'<div class="bar"><h2>Categories</h2><button data-edit="category">Add category</button></div>'+library.categories.map(c=>row(c,'category',c)).join(''):'')+
 '<div class="bar"><h2>Viewer profiles</h2><button data-edit="profile">Add profile</button></div><p class="muted">Names for people using this device.</p>'+profiles.items.map(p=>row(p.name,'profile',p.id)).join('');
 const auth=$('#auth');if(auth)auth.onclick=login;
 const view=$('#catalogue-view');if(view)view.onclick=()=>{selectLibrary(personal?'shared':'personal');$('#catalogue-view').focus()};
 const importButton=$('#import-catalogue');if(importButton)importButton.onclick=importCatalogue;
}
function importCatalogue(){
 const uid=user.uid;
 show('Import device library','<form><p>Copy videos and categories from this device into My library. Existing titles with the same link or ID are kept.</p><button class="primary">Import</button><p class="err" role="alert"></p></form>');
 submit(()=>{
  const local=deviceLibrary();
  return cloud.savePersonal(uid,target=>{
   const ids=new Set(target.videos.map(video=>video.id));
   const urls=new Set(target.videos.map(video=>video.url));
   for(const video of local.videos){
    if(ids.has(video.id)||urls.has(video.url))continue;
    target.videos.push(video);
    ids.add(video.id);
    urls.add(video.url);
   }
   target.categories=[...new Set([...target.categories,...local.categories])];
  });
 });
}
function login(){show('Administrator sign-in','<form><label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" required></label><button class="primary">Sign in</button><p class="err"></p></form>');submit(async d=>cloud.login(d.email,d.password));}
function submit(fn){const form=body.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const btn=form.querySelector('button');btn.disabled=true;try{await fn(Object.fromEntries(new FormData(form)));if(form.isConnected)modal.close();render()}catch(err){form.querySelector('.err').textContent=err.message}finally{btn.disabled=false}}}
function changeLibrary(fn){if(inPersonal())return cloud.savePersonal(user.uid,fn);if(window.STRAND_FIREBASE){if(!isAdmin)throw Error('Administrator access is required.');return cloud.save(fn)}const next=structuredClone(deviceLibrary());fn(next);localStorage.setItem(key,JSON.stringify(next));sharedLibrary=library=next;}
function changeProfiles(fn){
 const previous=owner(),next=structuredClone(read(pk,profiles));
 fn(next);
 localStorage.setItem(pk,JSON.stringify(next));
 profiles=next;
 if(previous!==owner())refreshViewer();
}
function refreshViewer(){
 StrandPlayer.close();
 if(modal.open&&body.querySelector('form'))modal.close();
 offline={...offline,videos:[]};
 offlineError=offlineMessage='';
 offlineAction();
 filter='';
}
function edit(type,id){
 const scopeAtOpen=inPersonal();
 const item=type==='video'?library.videos.find(v=>v.id===id):null;
 let fields='<label>Name<input name="name" maxlength="90" required value="'+esc(type==='profile'?profiles.items.find(p=>p.id===id)?.name:id)+'"></label>';
 if(type==='video'){if(!library.categories.length)return notice('Create a category first.');fields='<label>Video URL<input name="url" type="url" required value="'+esc(item?.url)+'"></label>'+
 '<img class="cover-preview" alt="Cover artwork preview"><p class="lookup-status" role="status"></p>'+
 '<label>Title<input name="title" maxlength="150" required value="'+esc(item?.title)+'"></label>'+
 '<label>Category<select name="category">'+library.categories.map(c=>'<option '+(item?.category===c?'selected':'')+'>'+esc(c)+'</option>').join('')+'</select></label>'+
 '<label>Description<textarea name="description" rows="4" maxlength="5000">'+esc(item?.description)+'</textarea></label>'+
 '<label>Cover artwork<select name="art">'+['youtube','aurora','coast','bloom'].map(a=>'<option value="'+a+'" '+(item?.art===a?'selected':'')+'>'+ (a==='youtube'?'YouTube thumbnail':a)+'</option>').join('')+'</select></label>';}
 show((id?'Edit ':'Add ')+type,'<form>'+fields+'<button class="primary">Save</button><p class="err" role="alert"></p></form>');
 if(type==='video')bindVideoPreview(body.querySelector('form'),item);
 submit(async data=>{for(const k in data)data[k]=data[k].trim();if(!(data.name||data.title))throw Error('Enter a name or title.');
 if(type==='profile'){changeProfiles(p=>{const v=p.items.find(v=>v.id===id);if(v)v.name=data.name;else p.items.push({id:crypto.randomUUID(),name:data.name})});return}
 if(scopeAtOpen!==inPersonal())throw Error('The active library changed. Open the editor again.');
 if(type==='video'){source(data.url);data.coverMode=data.art==='youtube'?'auto':'manual';}
 await changeLibrary(l=>{if(type==='category'){if(id&&!l.categories.includes(id))throw Error('Category changed. Reopen Studio.');if(data.name!==id&&l.categories.includes(data.name))throw Error('This category already exists.');if(id){l.categories[l.categories.indexOf(id)]=data.name;l.videos.forEach(v=>{if(v.category===id)v.category=data.name})}else l.categories.push(data.name)}
 else{if(!l.categories.includes(data.category))throw Error('Category changed. Reopen Studio.');const v={...data,id:id||crypto.randomUUID()};if(id){const n=l.videos.findIndex(v=>v.id===id);if(n<0)throw Error('This video was removed.');l.videos[n]=v}else l.videos.push(v)}});filter='';});}
function remove(type,id){const scopeAtOpen=inPersonal();show('Remove '+type,'<form><p>Remove “'+esc(type==='video'?library.videos.find(v=>v.id===id)?.title:type==='profile'?profiles.items.find(p=>p.id===id)?.name:id)+'”?</p><div class="actions"><button>Remove</button></div><p class="err"></p></form>');submit(async()=>{if(type==='profile'){changeProfiles(p=>{if(p.items.length===1)throw Error('Keep at least one viewer profile.');p.items=p.items.filter(v=>v.id!==id);if(p.active===id)p.active=p.items[0].id});return}if(scopeAtOpen!==inPersonal())throw Error('The active library changed. Open the editor again.');await changeLibrary(l=>{if(type==='video')l.videos=l.videos.filter(v=>v.id!==id);else{if(l.videos.some(v=>v.category===id))throw Error('Move or remove videos in this category first.');l.categories=l.categories.filter(c=>c!==id)}});filter='';});}
main.onclick=e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;if('play'in d)play(d.play,b);if('filter'in d){filter=d.filter;render();[...document.querySelectorAll('[data-filter]')].find(b=>b.dataset.filter===filter)?.focus()}if(d.edit)edit(d.edit,d.id);if(d.remove)remove(d.remove,d.id);
 if(d.offlinePlay)play(d.offlinePlay,b,true);
 if(b.getAttribute('aria-disabled')==='true')return;
 if(d.offlineRemove)offlineAction('remove',d.offlineRemove);
 if(d.offlineSave){
  const video=availableOffline().find(video=>video.id===d.offlineSave);
  if(video){
   navigator.storage?.persist?.().catch(()=>{});
   offlineAction('save',downloadDetails(video));
  }
 }
};
$('#profile').onclick=()=>{
 const account=user?'<p>'+esc(user.displayName||user.email||'Signed in')+'</p><div class="actions"><button id="library-view">'+(inPersonal()?'Open shared library':'Open my library')+'</button><button id="sign-out">Sign out</button></div>':
 cloud?'<button id="google-sign-in" class="primary">Continue with Google</button>':
 window.STRAND_FIREBASE?'<p class="muted">Account sign-in is unavailable. Check your connection and try again.</p>':'';
 show('Viewer profiles',account+'<p class="err" id="account-error" role="alert"></p>'+
 (user?'':profiles.items.map(p=>'<div class="row"><span>'+esc(p.name)+'</span><button data-p="'+esc(p.id)+'">'+(p.id===profiles.active?'Selected':'Choose')+'</button></div>').join('')));
 const accountAction=(selector,action)=>{
  const button=$(selector);
  if(!button)return;
  button.onclick=async()=>{
   button.disabled=true;
   try{await action();if(button.isConnected)modal.close()}
   catch(err){if(button.isConnected)$('#account-error').textContent=err.message}
   finally{button.disabled=false}
  };
 };
 accountAction('#google-sign-in',()=>cloud.google(isAndroid));
 accountAction('#sign-out',()=>cloud.logout());
 accountAction('#library-view',()=>selectLibrary(inPersonal()?'shared':'personal'));
 body.querySelectorAll('[data-p]').forEach(b=>b.onclick=()=>{
  changeProfiles(p=>p.active=b.dataset.p);
  render();
  modal.close();
 });
};
window.onhashchange=()=>{filter='';render();if(location.hash==='#offline')offlineAction();document.querySelector('nav .active')?.focus()};
window.addEventListener('storage',event=>{
 if(event.key!==key&&event.key!==pk&&event.key!=='strand.library.view.'+user?.uid)return;
 if(!window.STRAND_FIREBASE)sharedLibrary=deviceLibrary();
 const prior=owner();
 profiles=read(pk,profiles);
 if(prior!==owner())refreshViewer();
 library=inPersonal()?personalLibrary:sharedLibrary;
 render();
});
window.strandBack=()=>{if(StrandPlayer.isOpen()){StrandPlayer.close();return true}if(modal.open){modal.close();return true}return false};
// Apps and TV tabs stay open for days, so a deploy would otherwise never reach them.
function watchForUpdates(){
 let offered=false;
 const ask=()=>{if(StrandPlayer.isOpen()||modal.open)return void setTimeout(ask,5000);
  show('Strand TV was updated','<p class="muted">Restart to load the latest version.</p><div class="actions"><button class="primary" id="restart">Restart now</button><button id="later">Later</button></div>');
  $('#restart').onclick=()=>location.reload();$('#later').onclick=()=>modal.close();$('#restart').focus()};
 const check=async resumed=>{if(offered||document.hidden)return;try{
  const v=await(await fetch('./version.json?t='+Date.now(),{cache:'no-store'})).json();
  if(!v.build||v.build===window.STRAND_BUILD||offered)return;
  offered=true;
  // Coming back with nothing playing: load the new version straight away instead of asking.
  if(resumed&&!StrandPlayer.isOpen()&&!modal.open)return location.reload();
  ask()}catch{}};
 window.strandResume=()=>check(true);
 setTimeout(check,60e3);setInterval(check,15*60e3);document.addEventListener('visibilitychange',()=>check(true));
}
if(window.STRAND_BUILD)watchForUpdates();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)offlineAction()});
for(const event of ['online','offline'])window.addEventListener(event,()=>{if(location.hash==='#offline')offlinePage()});
document.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
 const active=document.activeElement;
 const offlineControl=active.id==='offline-auto'||(active.id==='offline-limit'&&['ArrowUp','ArrowDown'].includes(e.key));
 if(!offlineControl&&['INPUT','SELECT','VIDEO','IFRAME','TEXTAREA'].includes(active.tagName))return;
 const scope=document.getElementById('fs-player')||(modal.open?modal:document);
 const items=[...scope.querySelectorAll('a[href],button:not(:disabled),input,select,iframe,video,[tabindex="0"]')].filter(n=>n.tabIndex>=0&&(n===active||n.getAttribute('aria-disabled')!=='true')&&!n.closest('[inert]')&&n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden');
 const a=document.activeElement;if(!items.includes(a)){e.preventDefault();items[0]?.focus();return}
 const center=n=>{const r=n.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]},[x,y]=center(a),horizontal=['ArrowLeft','ArrowRight'].includes(e.key),sign=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1;
 // Cross-axis distance is measured to the target's edges so wide targets (the seek bar) count as straight ahead.
 const opts=items.filter(n=>n!==a).map(n=>{const [i,j]=center(n),r=n.getBoundingClientRect(),d=(horizontal?i-x:j-y)*sign,c=horizontal?Math.max(0,r.top-y,y-r.bottom):Math.max(0,r.left-x,x-r.right);return {n,d,c,score:d+4*c}}).filter(o=>o.d>2&&o.c<o.d*2).sort((a,b)=>a.score-b.score);
 // Left/Right stays on the same row when it can, even if something on the next row is closer.
 const row=a.getBoundingClientRect(),same=horizontal&&opts.find(o=>{const r=o.n.getBoundingClientRect();return r.top<row.bottom&&r.bottom>row.top});
 const pick=same||opts[0];if(pick){e.preventDefault();pick.n.focus()}});
render();
Releases.footer();Releases.announce();AppInstall.banner();
offlineAction();
if(window.STRAND_FIREBASE){
 Offline.request('firebase').catch(()=>{});
 import('./firebase.js').then(m=>{
  cloud=m.connect(window.STRAND_FIREBASE,seed,state=>{
   const previous=owner();
   ({user,isAdmin,ready,cloudError,personalError}=state);
   sharedLibrary=state.library;
   personalLibrary=state.personal;
   library=inPersonal()?personalLibrary:sharedLibrary;
   if(previous!==owner())refreshViewer();
   render();
  });
  render();
 }).catch(()=>{cloudError='Firebase is unavailable. Showing the last shared library on this device.';render()});
}
