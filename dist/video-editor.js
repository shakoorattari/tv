function youtubeVideoId(url) {
  try { return source(url).videoId || ''; } catch { return ''; }
}

function bindVideoPreview(form, item) {
  const {url, title, description, art} = form.elements;
  const preview = form.querySelector('.cover-preview');
  const status = form.querySelector('.lookup-status');
  const automatic = art.querySelector('[value="youtube"]');
  const edited = new Set();
  for (const field of [title, description]) {
    if (field.value) edited.add(field);
    field.addEventListener('input', () => edited.add(field));
  }
  let previous, controller, timer;
  function paint() {
    const src = cover({url:url.value.trim(), art:art.value, coverMode:'manual'});
    preview.src = src;
  }
  async function fill(id, signal) {
    const watch = 'https://www.youtube.com/watch?v=' + id;
    let details;
    try {
      const key = window.STRAND_YOUTUBE_API_KEY;
      const endpoint = key ? 'https://www.googleapis.com/youtube/v3/videos?' +
        new URLSearchParams({part:'snippet', id, key}) : './api/youtube?id='+id;
      const res = await fetch(endpoint, {signal});
      if (!res.ok) throw Error();
      const data = await res.json();
      details = key ? data.items?.[0]?.snippet : data;
      if (!details?.title) throw Error();
    } catch {
      if (signal.aborted) return;
      try {
        const res = await fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent(watch), {signal});
        if (!res.ok) throw Error();
        details = await res.json();
      } catch { details = {}; }
    }
    if (signal.aborted || !form.isConnected || youtubeVideoId(url.value.trim()) !== id) return;
    if (!edited.has(title) && details.title) title.value = details.title.slice(0,title.maxLength);
    if (!edited.has(description) && details.description) description.value = details.description.slice(0,description.maxLength);
    status.textContent = details.description ? 'YouTube details loaded.' : details.title ?
      'YouTube title loaded. You can enter a description.' : 'Details unavailable. You can enter a title and description.';
  }
  function update() {
    const id = youtubeVideoId(url.value.trim());
    if (id === previous) return;
    const initial = previous === undefined;
    previous = id;
    clearTimeout(timer);
    controller?.abort();
    automatic.disabled = !id;
    if (id) {
      if (!initial || !item || item.coverMode !== 'manual') art.value = 'youtube';
    } else if (art.value === 'youtube') art.value = 'aurora';
    if (!initial) {
      for (const field of [title, description]) if (!edited.has(field)) field.value = '';
    }
    paint();
    status.textContent = '';
    if (!id || (edited.has(title) && edited.has(description))) return;
    controller = new AbortController();
    const signal = controller.signal;
    status.textContent = 'Looking up YouTube details…';
    timer = setTimeout(()=>fill(id, signal),250);
  }
  preview.onerror = () => { if (!preview.src.endsWith('/art/aurora.svg')) preview.src='./art/aurora.svg'; };
  art.onchange = paint;
  url.oninput = update;
  update();
}
