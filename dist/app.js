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
let library=window.STRAND_FIREBASE?seed:deviceLibrary(), profiles=read(pk,{active:'guest',items:[{id:'guest',name:'Guest'}]});
let filter='',user=null,isAdmin=false,cloud=null,cloudError='',ready=!window.STRAND_FIREBASE,dialogOrigin=null;
const main=$('#main'),modal=$('#modal'),body=$('#body');
function source(raw){
 const u=new URL(raw); if(u.protocol!=='https:'||u.username||u.password)throw Error('Enter an HTTPS link without credentials.');
 const h=u.hostname,p=u.pathname,parts=p.split('/');let id;
 if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(h)){
 if(p==='/playlist' && /^[A-Za-z0-9_-]+$/.test(u.searchParams.get('list')||'')){
   return {name:'YouTube playlist',embed:'https://www.youtube-nocookie.com/embed/videoseries?autoplay=1&playsinline=1&list='+u.searchParams.get('list')};
 }
 id=h==='youtu.be'?parts[1]:u.searchParams.get('v')||(['shorts','embed','live'].includes(parts[1])?parts[2]:'');
 if(!/^[\w-]{11}$/.test(id||''))throw Error('Enter a YouTube video link.');return {name:'YouTube',videoId:id,embed:'https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&playsinline=1'};}
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
 const page=['studio','library'].includes(location.hash.slice(1))?location.hash.slice(1):'home';
 document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+page));
 const profile=profiles.items.find(p=>p.id===profiles.active)||profiles.items[0];$('#profile').textContent=(profile?.name||'G')[0].toUpperCase();$('#profile').title=profile?.name||'Guest';
 if(page==='studio')return studio();
 const first=library.videos[0],videos=library.videos.filter(v=>!filter||v.category===filter);
 main.innerHTML=(page==='home'&&first?'<section class="hero" style="background-image:url('+cover(first)+')"><div><div class="eyebrow">◆ &nbsp; Featured film</div><h1>'+esc(first.title)+'</h1><p>'+esc(first.description)+'</p><button class="primary" data-play="'+esc(first.id)+'">▶ &nbsp; Watch now</button></div></section>':'<div class="page"><div class="eyebrow">Strand TV</div><h1>Video library</h1></div>')+
 (cloudError?'<p class="err">'+esc(cloudError)+'</p>':'')+
 '<div class="bar"><h2>'+ (page==='home'?'Explore the collection':'Browse by category')+'</h2><span>'+videos.length+' titles</span></div><div class="filters">'+['',...library.categories].map(c=>'<button aria-pressed="'+(filter===c)+'" class="'+(filter===c?'active':'')+'" data-filter="'+esc(c)+'">'+esc(c||'All titles')+'</button>').join('')+'</div><div class="grid">'+videos.map(v=>'<button class="card" data-play="'+esc(v.id)+'"><div class="thumb"><img alt="" src="'+cover(v)+'"><span class="tag">'+esc(source(v.url).name)+'</span></div><strong>'+esc(v.title)+'</strong><small>'+esc(v.category)+'</small></button>').join('')+'</div>'+(!videos.length?'<p class="empty">No videos in this collection yet.</p>':'');
}
function player(id){const v=library.videos.find(v=>v.id===id),s=source(v.url),url=esc(v.url);
 show(v.title,(s.media?'<video controls playsinline autoplay src="'+esc(s.media)+'"></video>':s.embed?'<iframe allow="autoplay; fullscreen; encrypted-media" allowfullscreen title="'+esc(v.title)+'" referrerpolicy="strict-origin-when-cross-origin" src="'+esc(s.embed)+'"></iframe>':'<p>This video opens on the provider’s website.</p>')+'<p class="muted">'+esc(v.description)+'</p><a class="button" target="_blank" rel="noopener noreferrer" href="'+url+'">Open original ↗</a><p id="mediaError" role="status"></p>');
 if(body.querySelector('video'))body.querySelector('video').onerror=()=>$('#mediaError').textContent='This browser could not play the video. Try Open original.';}
function row(name,type,id){return '<div class="row"><span>'+esc(name)+'</span><button data-edit="'+type+'" data-id="'+esc(id)+'">Edit</button><button data-remove="'+type+'" data-id="'+esc(id)+'">Remove</button></div>'}
function studio(){
 const local=!window.STRAND_FIREBASE,can=local||isAdmin;
 main.innerHTML='<section class="page"><div class="eyebrow">Library management</div><h1>Studio</h1><p class="muted">'+(local?'Device edition · Changes are saved in this browser.':cloudError||(!ready?'Connecting to Firebase…':isAdmin?'Shared library · Administrator':user?'This account has viewer access.':'Sign in with a library administrator account.'))+'</p></section>'+
 (!local&&cloud?'<button id="auth">'+(user?'Sign out':'Administrator sign-in')+'</button>':'')+
 (can?'<div class="bar"><h2>Videos</h2><button data-edit="video">Add video</button></div>'+library.videos.map(v=>row(v.title,'video',v.id)).join('')+'<div class="bar"><h2>Categories</h2><button data-edit="category">Add category</button></div>'+library.categories.map(c=>row(c,'category',c)).join(''):'')+
 '<div class="bar"><h2>Viewer profiles</h2><button data-edit="profile">Add profile</button></div><p class="muted">Names for people using this device.</p>'+profiles.items.map(p=>row(p.name,'profile',p.id)).join('');
 const auth=$('#auth');if(auth)auth.onclick=()=>user?cloud.logout():login();}
function login(){show('Administrator sign-in','<form><label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" required></label><button class="primary">Sign in</button><p class="err"></p></form>');submit(async d=>cloud.login(d.email,d.password));}
function submit(fn){const form=body.querySelector('form');form.onsubmit=async e=>{e.preventDefault();const btn=form.querySelector('button');btn.disabled=true;try{await fn(Object.fromEntries(new FormData(form)));modal.close();render()}catch(err){form.querySelector('.err').textContent=err.message}finally{btn.disabled=false}}}
function changeLibrary(fn){if(window.STRAND_FIREBASE){if(!isAdmin)throw Error('Administrator access is required.');return cloud.save(fn)}const next=structuredClone(deviceLibrary());fn(next);localStorage.setItem(key,JSON.stringify(next));library=next;}
function changeProfiles(fn){const next=structuredClone(read(pk,profiles));fn(next);localStorage.setItem(pk,JSON.stringify(next));profiles=next;}
function edit(type,id){
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
 if(type==='video'){source(data.url);data.coverMode=data.art==='youtube'?'auto':'manual';}
 await changeLibrary(l=>{if(type==='category'){if(id&&!l.categories.includes(id))throw Error('Category changed. Reopen Studio.');if(data.name!==id&&l.categories.includes(data.name))throw Error('This category already exists.');if(id){l.categories[l.categories.indexOf(id)]=data.name;l.videos.forEach(v=>{if(v.category===id)v.category=data.name})}else l.categories.push(data.name)}
 else{if(!l.categories.includes(data.category))throw Error('Category changed. Reopen Studio.');const v={...data,id:id||crypto.randomUUID()};if(id){const n=l.videos.findIndex(v=>v.id===id);if(n<0)throw Error('This video was removed.');l.videos[n]=v}else l.videos.push(v)}});filter='';});}
function remove(type,id){show('Remove '+type,'<form><p>Remove “'+esc(type==='video'?library.videos.find(v=>v.id===id)?.title:type==='profile'?profiles.items.find(p=>p.id===id)?.name:id)+'”?</p><div class="actions"><button>Remove</button></div><p class="err"></p></form>');submit(async()=>{if(type==='profile'){changeProfiles(p=>{if(p.items.length===1)throw Error('Keep at least one viewer profile.');p.items=p.items.filter(v=>v.id!==id);if(p.active===id)p.active=p.items[0].id});return}await changeLibrary(l=>{if(type==='video')l.videos=l.videos.filter(v=>v.id!==id);else{if(l.videos.some(v=>v.category===id))throw Error('Move or remove videos in this category first.');l.categories=l.categories.filter(c=>c!==id)}});filter='';});}
main.onclick=e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;if('play'in d)player(d.play);if('filter'in d){filter=d.filter;render();[...document.querySelectorAll('[data-filter]')].find(b=>b.dataset.filter===filter)?.focus()}if(d.edit)edit(d.edit,d.id);if(d.remove)remove(d.remove,d.id)};
$('#profile').onclick=()=>{show('Choose viewer',profiles.items.map(p=>'<div class="row"><span>'+esc(p.name)+'</span><button data-p="'+esc(p.id)+'">'+(p.id===profiles.active?'Selected':'Choose')+'</button></div>').join(''));body.querySelectorAll('button').forEach(b=>b.onclick=()=>{changeProfiles(p=>p.active=b.dataset.p);render();modal.close()})};
window.onhashchange=()=>{filter='';render();document.querySelector('nav .active')?.focus()};window.addEventListener('storage',()=>{if(!window.STRAND_FIREBASE)library=deviceLibrary();profiles=read(pk,profiles);render()});
document.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||['INPUT','SELECT','VIDEO','IFRAME','TEXTAREA'].includes(document.activeElement.tagName))return;
 const items=[...(modal.open?modal:document).querySelectorAll('a[href],button:not(:disabled),input,select,iframe,video')].filter(n=>n.getClientRects().length);
 const a=document.activeElement;if(!items.includes(a)){e.preventDefault();items[0]?.focus();return}
 const center=n=>{const r=n.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]},[x,y]=center(a),horizontal=['ArrowLeft','ArrowRight'].includes(e.key),sign=['ArrowLeft','ArrowUp'].includes(e.key)?-1:1;
 const opts=items.filter(n=>n!==a).map(n=>{const [i,j]=center(n),d=(horizontal?i-x:j-y)*sign,c=Math.abs(horizontal?j-y:i-x);return {n,d,c,score:d+4*c}}).filter(o=>o.d>2&&o.c<o.d*2).sort((a,b)=>a.score-b.score);if(opts.length){e.preventDefault();opts[0].n.focus()}});
render();
if(window.STRAND_FIREBASE)import('./firebase.js').then(m=>m.connect(window.STRAND_FIREBASE,seed,(state)=>{({user,isAdmin,ready,cloudError}=state);library=state.library;render()})).then(c=>{cloud=c;render()}).catch(()=>{cloudError='Firebase is unavailable. Showing the sample collection.';render()});
