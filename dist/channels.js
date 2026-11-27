// Channel subscriptions live in the catalogue. Upload lists are refreshed per device.
const ChannelFeeds = (() => {
 const feeds = new Map();
 const interval = 15 * 60_000;
 async function api(resource, params) {
  const key = window.STRAND_YOUTUBE_API_KEY;
  if (!key) throw Error('Configure the YouTube Data API key to enable channel updates.');
  const query = new URLSearchParams({...params, key});
  const response = await fetch('https://www.googleapis.com/youtube/v3/'+resource+'?'+query, {signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw Error('YouTube could not load this channel. Check the API key, quota and connection.');
  return (await response.json()).items || [];
 }
 async function resolve(input) {
  let ref = input.trim();
  if (/^(https?:\/\/|(?:www\.)?youtube\.com\/)/i.test(ref)) {
   const url = new URL(ref.includes('://')?ref:'https://'+ref);
   if (!['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)) throw Error('Enter a YouTube channel.');
   const parts = decodeURIComponent(url.pathname).split('/').filter(Boolean);
   ref = parts[0]==='channel'?parts[1]:parts[0];
  }
  const param = /^UC[\w-]{22}$/.test(ref)?{id:ref}:ref?.startsWith('@')?{forHandle:ref}:null;
  if (!param) throw Error('Enter a YouTube @handle or channel ID.');
  const [channel] = await api('channels',{part:'snippet,contentDetails',...param});
  if (!channel?.contentDetails?.relatedPlaylists?.uploads) throw Error('Channel not found.');
  return {id:channel.id,title:channel.snippet.title,description:channel.snippet.description || '',
   uploads:channel.contentDetails.relatedPlaylists.uploads};
 }
 async function refresh(channel, changed) {
  const feed = feeds.get(channel.id) || {items:[],next:0};
  if (!navigator.onLine || Date.now()<feed.next || feed.loading) return;
  feeds.set(channel.id,feed);
  feed.loading=true;
  try {
   const items=await api('playlistItems',{part:'snippet,status',playlistId:channel.uploads,maxResults:50});
   feed.items=items.filter(i=>i.status?.privacyStatus==='public' && /^[\w-]{11}$/.test(i.snippet?.resourceId?.videoId))
    .map(({snippet:s})=>({videoId:s.resourceId.videoId,title:s.title,description:s.description}));
   feed.next=Date.now()+interval;
   changed();
  } catch {feed.next=Date.now()+60000;} finally {feed.loading=false;}
 }
 function videos(catalog) {
  const extra=[],seen=new Set(catalog.videos.map(v=>v.category+'|'+youtubeVideoId(v.url)));
  for(const c of catalog.channels||[]) for(const v of feeds.get(c.id)?.items||[]) {
   const key=c.category+'|'+v.videoId;
   if(seen.has(key))continue;
   seen.add(key);
   extra.push({...v,id:'feed:'+c.id+':'+v.videoId,category:c.category,url:'https://www.youtube.com/watch?v='+v.videoId,art:'youtube'});
  }
  return [...extra,...catalog.videos];
 }
 return {resolve,refresh,videos};
})();
