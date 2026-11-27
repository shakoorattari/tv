'use strict';

const scope = new URL(self.registration.scope);
const build = 'STRAND_SW_BUILD';
const prefix = 'strand:' + scope.pathname + ':';
const shellName = prefix + 'shell:' + build;
const mediaName = prefix + 'offline:v1';
const mb = 1_000_000;
const assets = [
  'index.html', 'style.css', 'config.js', 'kids-catalog.js', 'video-editor.js',
  'player.js', 'releases.js', 'install.js', 'offline.js', 'app.js', 'firebase.js', 'device-auth.js',
  'changelog.json', 'art/aurora.svg', 'art/coast.svg', 'art/bloom.svg',
];
const firebaseBase = 'https://www.gstatic.com/firebasejs/10.14.1/';
const firebaseScripts = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'];
const address = path => new URL(path, scope).href;
const settingsKey = address('_offline/settings');
let activeDownload;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(shellName).then(cache => cache.addAll(assets.map(path => {
    const versioned = build !== 'STRAND_' + 'SW_BUILD' && /^(?:style\.css|config\.js|kids-catalog\.js|video-editor\.js|player\.js|releases\.js|install\.js|offline\.js|app\.js)$/.test(path);
    return new Request(address(path + (versioned ? '?v=' + build : '')), {cache: 'reload'});
  }))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(name => name.startsWith(prefix + 'shell:') && name !== shellName)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function serveShell(request, fallback) {
  const cache = await caches.open(shellName);
  try {
    const response = await fetch(request);
    if (response.ok) return response;
  } catch {}
  return await cache.match(fallback) || Response.error();
}

async function cachedSdk(request) {
  const cache = await caches.open(prefix + 'firebase');
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone()).catch(() => {});
  return response;
}

self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (firebaseScripts.some(file => request.url === firebaseBase + file)) {
    event.respondWith(cachedSdk(request));
    return;
  }
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const path = url.pathname.slice(scope.pathname.length);
  if (/^_offline\/video\/[\da-f-]{36}$/.test(path)) {
    event.respondWith(serveVideo(request, url.origin + url.pathname));
  } else if (request.mode === 'navigate' && ['', 'index.html'].includes(path)) {
    event.respondWith(serveShell(request, address('index.html')));
  } else if (assets.includes(path)) {
    event.respondWith(serveShell(request, request.url));
  }
});

async function serveVideo(request, key) {
  const response = await (await caches.open(mediaName)).match(key);
  if (!response) return new Response('Download unavailable', {status: 404});
  const size = Number(response.headers.get('content-length'));
  const headers = {'Content-Type': response.headers.get('content-type'), 'Accept-Ranges': 'bytes'};
  const range = request.headers.get('range');
  if (!range) return new Response(response.body, {headers: {...headers, 'Content-Length': size}});
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const first = match?.[1] ? Number(match[1]) : Math.max(0, size - Number(match?.[2]));
  const last = match?.[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (!match || (!match[1] && !match[2]) || first >= size || last < first) {
    return new Response(null, {status: 416, headers: {'Content-Range': 'bytes */' + size}});
  }
  // Skip and trim chunks as the player reads so seeking doesn't load the whole file into memory.
  const reader = response.body.getReader();
  let offset = 0;
  const body = new ReadableStream({
    async pull(controller) {
      while (offset <= last) {
        const {value, done} = await reader.read();
        if (done) break;
        const start = offset;
        offset += value.length;
        if (offset <= first) continue;
        controller.enqueue(value.subarray(Math.max(first - start, 0), last + 1 - start));
        if (offset <= last) return;
      }
      controller.close();
      await reader.cancel();
    },
    cancel: () => reader.cancel(),
  });
  return new Response(body, {status: 206, headers: {
    ...headers, 'Content-Length': last - first + 1, 'Content-Range': 'bytes ' + first + '-' + last + '/' + size,
  }});
}

async function records(cache) {
  const keys = await cache.keys();
  const videos = await Promise.all(keys.filter(key => key.url !== settingsKey).map(async key => {
    const response = await cache.match(key);
    const item = JSON.parse(decodeURIComponent(response.headers.get('x-strand-title')));
    await response.body.cancel();
    return {...item, key: key.url, size: Number(response.headers.get('content-length'))};
  }));
  return videos.sort((a, b) => a.savedAt - b.savedAt);
}

async function trim(cache, videos, limit) {
  let used = videos.reduce((sum, item) => sum + item.size, 0);
  for (const item of videos) {
    if (used <= limit) break;
    await cache.delete(item.key);
    used -= item.size;
  }
}

async function save(cache, videos, limit, owner, video) {
  if (videos.some(item => item.owner === owner && item.url === video.url)) return;
  const url = new URL(video.url);
  if (url.protocol !== 'https:' || url.username || url.password || !/\.(mp4|webm)$/i.test(url.pathname)) {
    throw Error('Choose a direct HTTPS MP4 or WebM video.');
  }
  if (!limit) throw Error('Set a storage limit to save videos.');
  const controller = new AbortController();
  activeDownload = {owner, controller};
  const timeout = setTimeout(() => controller.abort(), 10 * 60_000);
  try {
    const response = await fetch(url, {credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal});
    const type = response.headers.get('content-type')?.split(';')[0];
    const size = Number(response.headers.get('content-length'));
    if (response.status !== 200 || !['video/mp4', 'video/webm'].includes(type) || !Number.isSafeInteger(size) || size <= 0) {
      throw Error('The source must allow downloads and provide a video type and file size.');
    }
    if (size > limit) throw Error('This video is larger than the offline storage limit.');
    await trim(cache, videos, limit - size);
    let received = 0;
    const stream = response.body.pipeThrough(new TransformStream({
      transform(chunk, output) {
        received += chunk.byteLength;
        if (received > size) throw Error('The download exceeded the reported size.');
        output.enqueue(chunk);
      },
      flush() {
        if (received !== size) throw Error('The download was incomplete.');
      },
    }));
    const item = {...video, owner, savedAt: Date.now()};
    await cache.put(address('_offline/video/' + crypto.randomUUID()), new Response(stream, {headers: {
      'Content-Type': type, 'Content-Length': size, 'X-Strand-Title': encodeURIComponent(JSON.stringify(item)),
    }}));
  } finally {
    clearTimeout(timeout);
    activeDownload = undefined;
    controller.abort();
  }
}

let queue = Promise.resolve();
self.addEventListener('message', event => {
  const page = event.source?.url && new URL(event.source.url);
  if (!event.ports[0] || event.source?.type !== 'window' || page?.origin !== scope.origin ||
      ![scope.pathname, new URL('index.html', scope).pathname].includes(page.pathname)) return;
  const reply = event.ports[0];
  const {action, owner, value} = event.data || {};
  if (action === 'firebase') {
    event.waitUntil(Promise.allSettled(firebaseScripts.map(file => cachedSdk(new Request(firebaseBase + file, {mode: 'cors'}))))
      .then(() => reply.postMessage({})));
    return;
  }
  if (action === 'forget' && activeDownload && activeDownload.owner === owner) activeDownload.controller.abort();
  const operation = queue.then(async () => {
    const cache = await caches.open(mediaName);
    const config = await (await cache.match(settingsKey))?.json() || {limit: 500, auto: true};
    let videos = await records(cache);
    if (action === 'configure') {
      if (!Number.isInteger(value.limit) || value.limit < 0 || !Number.isSafeInteger(value.limit * mb)) throw Error('Enter a valid whole number of MB.');
      config.limit = value.limit;
      config.auto = Boolean(value.auto);
      await trim(cache, videos, config.limit * mb);
      await cache.put(settingsKey, new Response(JSON.stringify(config)));
    }
    if (action === 'save') await save(cache, videos, config.limit * mb, owner, value);
    if (action === 'remove' && videos.some(item => item.owner === owner && item.key === value)) await cache.delete(value);
    if (action === 'forget' && typeof owner === 'string' && owner.startsWith('account:')) {
      await Promise.all(videos.filter(item => item.owner === owner).map(item => cache.delete(item.key)));
    }
    if (action !== 'list') videos = await records(cache);
    return {config, used: videos.reduce((sum, item) => sum + item.size, 0), videos: videos.filter(item => item.owner === owner)};
  });
  queue = operation.catch(() => {});
  event.waitUntil(operation.then(data => reply.postMessage({data}), err => reply.postMessage({error: err.message})));
});
