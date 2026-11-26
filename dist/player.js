'use strict';
// Fullscreen player. YouTube plays through the IFrame Player API with controls=0, so YouTube draws no
// control bar, pause overlay or end screen; our own controls drive it. Direct files use <video>.
const StrandPlayer = (() => {
  const COUNTDOWN = 5, HIDE_AFTER = 4000, SEEK_STEP = 10;
  const icon = d => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  const icons = {
    play: icon('M8 5.5v13L18.5 12z'),
    pause: icon('M7 5h3.5v14H7zm6.5 0H17v14h-3.5z'),
    prev: icon('M6 5h2.5v14H6zm13 .5v13L9.5 12z'),
    next: icon('M15.5 5H18v14h-2.5zM5 5.5v13l9.5-6.5z'),
    close: icon('M6.4 5 5 6.4l5.6 5.6L5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z'),
  };
  const fmt = s => {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + sec : m + ':' + sec;
  };
  const kindOf = item => item.videoId || item.list ? 'youtube' : item.media ? 'file' : item.embed ? 'frame' : 'none';
  const pref = {
    get: () => { try { return localStorage.getItem('strand.captions') === 'on'; } catch { return false; } },
    set: on => { try { localStorage.setItem('strand.captions', on ? 'on' : 'off'); } catch {} },
  };

  let api;
  function youtubeApi() {
    api ??= new Promise((resolve, reject) => {
      if (window.YT?.Player) return resolve(window.YT);
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT); };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => { api = null; script.remove(); reject(Error('offline')); };
      document.head.append(script);
    });
    return api;
  }

  function youtube(host, emit) {
    const target = document.createElement('div');
    host.append(target);
    let player, item, destroyed = false, captions = false;
    // Auto-generated tracks are missing from the tracklist, so fall back to the viewer's language.
    const trackOf = p => {
      try { return p.getOption('captions', 'track')?.languageCode; } catch { return undefined; }
    };
    const hideCaptions = p => {
      p.setOption('captions', 'track', {});
      p.unloadModule('captions');
    };
    const syncCaptions = p => {
      if (!p.getOptions().includes('captions')) return;
      if (!captions) { if (trackOf(p)) hideCaptions(p); return; }
      if (trackOf(p)) return;
      const list = p.getOption('captions', 'tracklist') || [];
      p.setOption('captions', 'track', {languageCode: list[0]?.languageCode || navigator.language.split('-')[0] || 'en'});
    };
    const ready = youtubeApi().then(YT => new Promise(resolve => {
      if (destroyed) return;
      player = new YT.Player(target, {
        host: 'https://www.youtube-nocookie.com', width: '100%', height: '100%',
        playerVars: {autoplay: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, rel: 0, playsinline: 1, cc_load_policy: 0, origin: location.origin},
        events: {
          onReady: () => { player.getIframe().tabIndex = -1; resolve(player); },
          onStateChange: e => {
            if (e.data === 1) emit('playing');
            else if (e.data === 2) emit('paused');
            else if (e.data === 3) emit('buffering');
            else if (e.data === 0) {
              const list = player.getPlaylist();
              if (!item.list || !list || player.getPlaylistIndex() >= list.length - 1) emit('ended');
            }
          },
          onError: e => emit('error', e.data),
          onAutoplayBlocked: () => emit('blocked'),
          // YouTube turns captions on by itself for some videos; keep them matching the CC button.
          onApiChange: () => syncCaptions(player),
        },
      });
    }), () => emit('error', 'offline'));
    return {
      kind: 'youtube',
      load(next) {
        item = next;
        ready.then(p => { if (!p) return; if (next.list) p.loadPlaylist({list: next.list, listType: 'playlist'}); else p.loadVideoById(next.videoId); });
      },
      play: () => player?.playVideo(),
      pause: () => player?.pauseVideo(),
      seek: t => player?.seekTo(t, true),
      time: () => player?.getCurrentTime?.() || 0,
      duration: () => player?.getDuration?.() || 0,
      captions(on) {
        captions = on;
        ready.then(p => {
          if (!p) return;
          if (!on) return hideCaptions(p);
          p.loadModule('captions');
          syncCaptions(p);
        });
      },
      destroy() { destroyed = true; ready.then(p => p?.destroy()); host.replaceChildren(); },
    };
  }

  function file(host, emit) {
    const video = document.createElement('video');
    video.playsInline = true;
    video.preload = 'auto';
    video.tabIndex = -1;
    host.append(video);
    video.addEventListener('playing', () => emit('playing'));
    video.addEventListener('pause', () => { if (!video.ended) emit('paused'); });
    video.addEventListener('waiting', () => emit('buffering'));
    video.addEventListener('ended', () => emit('ended'));
    video.addEventListener('error', () => emit('error', 'file'));
    const play = () => video.play().catch(err => { if (err.name === 'NotAllowedError') emit('blocked'); });
    return {
      kind: 'file',
      load(next) { video.src = next.media; play(); },
      play,
      pause: () => video.pause(),
      seek: t => { video.currentTime = t; },
      time: () => video.currentTime || 0,
      duration: () => Number.isFinite(video.duration) ? video.duration : 0,
      captions() {},
      destroy() { host.replaceChildren(); video.removeAttribute('src'); video.load(); },
    };
  }

  // Embeds without a player API (Google Drive): the provider's own controls stay interactive.
  function frame(host, emit) {
    const el = document.createElement('iframe');
    el.allow = 'autoplay; fullscreen; encrypted-media';
    el.allowFullscreen = true;
    el.referrerPolicy = 'strict-origin-when-cross-origin';
    el.addEventListener('load', () => emit('playing'));
    host.append(el);
    return {
      kind: 'frame',
      load(next) { el.title = next.title; el.src = next.embed; },
      play() {}, pause() {}, seek() {}, captions() {},
      time: () => 0, duration: () => 0,
      destroy() { host.replaceChildren(); },
    };
  }

  const adapters = {youtube, file, frame};
  let session = null;

  function create(items, start, label, onClose) {
    const root = document.createElement('div');
    root.id = 'fs-player';
    root.className = 'sp';
    root.tabIndex = -1;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Video player');
    root.innerHTML =
      '<img class="sp-poster" alt=""><div class="sp-stage"></div><div class="sp-spinner" aria-hidden="true"></div>' +
      '<div class="sp-chrome"><button class="sp-btn sp-close" aria-label="Close player">' + icons.close + '</button>' +
      '<div class="sp-bottom"><div class="eyebrow sp-meta"></div><h2 class="sp-title"></h2>' +
      '<div class="sp-controls"><button class="sp-btn sp-prev" aria-label="Previous video">' + icons.prev + '</button>' +
      '<button class="sp-btn sp-play" aria-label="Play">' + icons.play + '</button>' +
      '<button class="sp-btn sp-next" aria-label="Next video">' + icons.next + '</button>' +
      '<span class="sp-time">0:00</span><div class="sp-seek" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0">' +
      '<div class="sp-seek-track"><div class="sp-seek-fill"></div></div></div><span class="sp-duration">0:00</span>' +
      '<button class="sp-btn sp-cc" aria-label="Captions" aria-pressed="false"><span>CC</span></button></div>' +
      '<div class="sp-queue" aria-label="Videos in this list"></div></div></div>' +
      '<section class="sp-panel" hidden><img class="sp-panel-art" alt=""><div class="sp-panel-body">' +
      '<div class="eyebrow sp-kicker"></div><h2 class="sp-panel-title"></h2><p class="sp-panel-text"></p>' +
      '<div class="sp-count" hidden><div class="sp-count-bar"><div></div></div><p class="sp-count-text" aria-live="polite"></p></div>' +
      '<div class="actions sp-actions"></div></div></section>';
    const q = s => root.querySelector(s);
    const ui = {
      poster: q('.sp-poster'), stage: q('.sp-stage'), chrome: q('.sp-chrome'), close: q('.sp-close'), meta: q('.sp-meta'),
      title: q('.sp-title'), prev: q('.sp-prev'), play: q('.sp-play'), next: q('.sp-next'), time: q('.sp-time'),
      seek: q('.sp-seek'), fill: q('.sp-seek-fill'), duration: q('.sp-duration'), cc: q('.sp-cc'), queue: q('.sp-queue'),
      panel: q('.sp-panel'), panelArt: q('.sp-panel-art'), kicker: q('.sp-kicker'), panelTitle: q('.sp-panel-title'),
      panelText: q('.sp-panel-text'), count: q('.sp-count'), countBar: q('.sp-count-bar div'), countText: q('.sp-count-text'),
      actions: q('.sp-actions'),
    };
    const cards = items.map((item, i) => {
      const card = document.createElement('button');
      card.className = 'sp-card';
      card.dataset.index = i;
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.src = item.poster;
      const name = document.createElement('span');
      name.textContent = item.title;
      card.append(img, name);
      return card;
    });
    ui.queue.append(...cards);

    let index = start, adapter = null, started = false, uiOn = false, disposed = false, pendingSeek = null, held = null;
    let captions = pref.get(), pointer = 'mouse', generation = 0;
    const timers = {};
    const state = () => root.dataset.state;
    const setState = s => { root.dataset.state = s; };
    const background = [...document.body.children].filter(n => !n.inert && n.id !== 'status');

    // Late events from a torn-down adapter (a <video> erroring as its source is cleared) must be ignored.
    function drop() {
      generation += 1;
      adapter?.destroy();
      adapter = null;
    }

    function nextPlayable(from) {
      for (let i = from + 1; i < items.length; i++) if (kindOf(items[i]) !== 'none') return i;
      return -1;
    }

    function load(i) {
      index = i;
      const item = items[i], kind = kindOf(item);
      clearInterval(timers.count);
      clearTimeout(timers.watch);
      pendingSeek = held = null;
      started = false;
      ui.panel.hidden = true;
      hideUi();
      setState('loading');
      root.dataset.kind = kind;
      ui.poster.src = item.poster;
      ui.title.textContent = item.title;
      ui.meta.textContent = label + ' · ' + (i + 1) + ' of ' + items.length;
      ui.next.disabled = nextPlayable(i) < 0;
      setPlayIcon(false);
      cards.forEach((card, n) => card.toggleAttribute('aria-current', n === i));
      const card = cards[i];
      ui.queue.scrollLeft = card.offsetLeft - (ui.queue.clientWidth - card.offsetWidth) / 2;
      if (kind === 'none') {
        drop();
        return message(item);
      }
      if (adapter?.kind !== kind || kind === 'frame') {
        drop();
        const id = generation;
        adapter = adapters[kind](ui.stage, (event, data) => { if (!disposed && id === generation) handle(event, data); });
      }
      adapter.load(item);
      adapter.captions(captions);
      timers.watch = setTimeout(() => { if (!started && state() === 'loading') blocked(); }, 12000);
    }

    function handle(event, data) {
      if (!ui.panel.hidden && event !== 'error') return;
      if (event === 'playing') {
        started = true;
        clearTimeout(timers.watch);
        setState('playing');
        setPlayIcon(true);
        scheduleHide();
      } else if (event === 'paused' && started) {
        setState('paused');
        setPlayIcon(false);
        showUi();
      } else if (event === 'buffering' && started) {
        setState('buffering');
      } else if (event === 'blocked') {
        blocked();
      } else if (event === 'ended' && started) {
        ended();
      } else if (event === 'error') {
        failed(data);
      }
    }

    function blocked() {
      setState('blocked');
      setPlayIcon(false);
      showUi(ui.play);
    }

    function ended() {
      setState('ended');
      setPlayIcon(false);
      const next = nextPlayable(index);
      if (next < 0) {
        return panel({art: items[index].poster, kicker: 'That’s everything in this list', title: label,
          actions: [['Start list again', () => load(Math.max(0, nextPlayable(-1)))], ['Close', close]]});
      }
      const item = items[next];
      panel({art: item.poster, kicker: 'Up next', title: item.title, text: item.description, countdown: next,
        actions: [['▶  Play now', () => load(next)], ['Cancel', cancel]]});
    }

    function failed(code) {
      started = false;
      clearTimeout(timers.watch);
      setState('ended');
      const item = items[index], next = nextPlayable(index);
      const text = code === 101 || code === 150 ? 'The owner doesn’t allow this video to be played outside YouTube.'
        : code === 100 ? 'This video is private or no longer available.'
        : code === 'offline' ? 'YouTube couldn’t be reached. Check the internet connection.'
        : 'Something went wrong while loading this video.';
      panel({art: item.poster, kicker: 'Can’t play this video', title: item.title, text, countdown: next < 0 ? null : next,
        actions: next < 0 ? [['Try again', () => load(index)], ['Close', close]] : [['Play next', () => load(next)], ['Close', close]]});
    }

    function message(item) {
      setState('ended');
      const next = nextPlayable(index), actions = [['Open link ↗', item.url]];
      if (next >= 0) actions.push(['Play next', () => load(next)]);
      actions.push(['Close', close]);
      panel({art: item.poster, kicker: 'Opens on the provider’s website', title: item.title, text: item.description, actions});
    }

    function panel({art, kicker, title, text = '', countdown = null, actions}) {
      clearInterval(timers.count);
      hideUi();
      ui.panelArt.src = art;
      ui.kicker.textContent = kicker;
      ui.panelTitle.textContent = title;
      ui.panelText.textContent = text;
      ui.panelText.hidden = !text;
      ui.actions.replaceChildren(...actions.map(([name, run], n) => {
        const el = document.createElement(typeof run === 'string' ? 'a' : 'button');
        el.textContent = name;
        if (n === 0) el.className = 'primary';
        if (typeof run === 'string') Object.assign(el, {href: run, target: '_blank', rel: 'noopener noreferrer', className: 'button primary'});
        else el.onclick = run;
        return el;
      }));
      ui.count.hidden = countdown === null;
      ui.panel.hidden = false;
      ui.actions.firstElementChild.focus({preventScroll: true});
      if (countdown === null) return;
      let left = COUNTDOWN;
      ui.countBar.style.animation = 'none';
      void ui.countBar.offsetWidth;
      ui.countBar.style.animation = '';
      ui.countText.textContent = 'Starting in ' + left + ' seconds';
      timers.count = setInterval(() => {
        left -= 1;
        if (left > 0) ui.countText.textContent = 'Starting in ' + left + (left === 1 ? ' second' : ' seconds');
        else load(countdown);
      }, 1000);
    }

    function cancel() {
      clearInterval(timers.count);
      ui.panel.hidden = true;
      showUi(ui.play);
    }

    function setPlayIcon(playing) {
      ui.play.innerHTML = playing ? icons.pause : icons.play;
      ui.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    }

    function showUi(focus) {
      if (!ui.panel.hidden) return;
      uiOn = true;
      root.classList.add('ui-on');
      ui.chrome.inert = false;
      if (focus) focus.focus({preventScroll: true});
      tick();
      scheduleHide();
    }

    function hideUi() {
      clearTimeout(timers.hide);
      if (root.contains(document.activeElement)) root.focus({preventScroll: true});
      uiOn = false;
      root.classList.remove('ui-on');
      ui.chrome.inert = true;
    }

    function scheduleHide() {
      clearTimeout(timers.hide);
      if (uiOn && state() === 'playing') timers.hide = setTimeout(hideUi, HIDE_AFTER);
    }

    function tick() {
      const d = adapter?.duration() || 0;
      if (held && (performance.now() - held.at > 1500 || Math.abs((adapter?.time() || 0) - held.t) < 1.5)) held = null;
      const t = pendingSeek ?? held?.t ?? adapter?.time() ?? 0;
      ui.time.textContent = fmt(t);
      ui.duration.textContent = fmt(d);
      ui.fill.style.transform = 'scaleX(' + (d ? Math.min(1, t / d) : 0) + ')';
      ui.seek.setAttribute('aria-valuemax', Math.round(d));
      ui.seek.setAttribute('aria-valuenow', Math.round(t));
      ui.seek.setAttribute('aria-valuetext', fmt(t) + ' of ' + fmt(d));
    }

    function seekTo(t) {
      adapter.seek(t);
      held = {t, at: performance.now()};
      pendingSeek = null;
      tick();
    }

    // Repeated remote presses are batched into one seek; each YouTube seek briefly shows its title.
    function seekBy(delta) {
      const d = adapter?.duration();
      if (!d || !started || state() === 'ended') return;
      pendingSeek = Math.max(0, Math.min(d - 1, (pendingSeek ?? held?.t ?? adapter.time()) + delta));
      tick();
      clearTimeout(timers.seek);
      timers.seek = setTimeout(() => seekTo(pendingSeek), 450);
    }

    function togglePlay() {
      if (!adapter) return;
      if (started && (state() === 'playing' || state() === 'buffering')) adapter.pause();
      else adapter.play();
    }

    function prev() {
      if (started && adapter.time() > 5) return seekTo(0);
      for (let i = index - 1; i >= 0; i--) if (kindOf(items[i]) !== 'none') return load(i);
      if (started) seekTo(0);
    }

    function next() {
      const i = nextPlayable(index);
      if (i >= 0) load(i);
    }

    function setCaptions(on) {
      captions = on;
      pref.set(on);
      ui.cc.setAttribute('aria-pressed', String(on));
      adapter?.captions(on);
    }

    function onKey(e) {
      if (!root.isConnected) return close();
      const k = e.key, active = document.activeElement;
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (k === 'Escape' || k === 'GoBack' || k === 'BrowserBack') { stop(); return close(); }
      if (!ui.panel.hidden) return;
      if (k === 'MediaPlayPause') { stop(); togglePlay(); return showUi(); }
      if (k === 'MediaPlay') { stop(); return adapter?.play(); }
      if (k === 'MediaPause') { stop(); return adapter?.pause(); }
      if (k === 'MediaTrackNext') { stop(); return next(); }
      if (k === 'MediaTrackPrevious') { stop(); return prev(); }
      if (k === 'MediaFastForward' || k === 'MediaRewind') { stop(); showUi(ui.seek); return seekBy(k === 'MediaRewind' ? -SEEK_STEP : SEEK_STEP); }
      const horizontal = k === 'ArrowLeft' || k === 'ArrowRight', arrow = horizontal || k === 'ArrowUp' || k === 'ArrowDown';
      if (!uiOn) {
        if (horizontal && started && adapter?.duration()) { stop(); showUi(ui.seek); return seekBy(k === 'ArrowLeft' ? -SEEK_STEP : SEEK_STEP); }
        if (k === ' ') { stop(); togglePlay(); return showUi(ui.play); }
        if (arrow || k === 'Enter') { stop(); showUi(ui.play); }
        return;
      }
      scheduleHide();
      if (active === ui.seek && horizontal) { stop(); return seekBy(k === 'ArrowLeft' ? -SEEK_STEP : SEEK_STEP); }
      if (active === ui.seek && (k === 'Enter' || k === ' ')) { stop(); return togglePlay(); }
      if ((active === root || !root.contains(active)) && (arrow || k === 'Enter')) { stop(); return ui.play.focus({preventScroll: true}); }
      if (k === ' ' && active.tagName !== 'BUTTON') { stop(); togglePlay(); }
    }

    root.addEventListener('pointerdown', e => { pointer = e.pointerType; }, true);
    root.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) showUi(); });
    root.addEventListener('click', e => {
      if (e.target.closest('button, a, .sp-seek, .sp-queue, .sp-panel')) return;
      if (pointer === 'mouse') { togglePlay(); return showUi(); }
      // YouTube's touch embed draws its own ▶ while paused, so a tap there should resume.
      if (state() === 'paused' || state() === 'blocked') return togglePlay();
      if (uiOn && state() === 'playing') hideUi(); else showUi();
    });
    ui.close.onclick = close;
    ui.play.onclick = togglePlay;
    ui.prev.onclick = prev;
    ui.next.onclick = next;
    ui.cc.onclick = () => setCaptions(!captions);
    ui.queue.onclick = e => {
      const card = e.target.closest('.sp-card');
      if (!card) return;
      const i = Number(card.dataset.index);
      if (i !== index) load(i);
      else if (state() !== 'playing') togglePlay();
    };
    ui.seek.addEventListener('pointerdown', e => {
      const d = adapter?.duration();
      if (!d || !started) return;
      const at = ev => {
        const r = ui.seek.getBoundingClientRect();
        return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * d;
      };
      const move = ev => { pendingSeek = at(ev); tick(); scheduleHide(); };
      const up = ev => {
        for (const [type, fn] of [['pointermove', move], ['pointerup', up], ['pointercancel', up]]) ui.seek.removeEventListener(type, fn);
        if (ev.type === 'pointerup') seekTo(at(ev)); else { pendingSeek = null; tick(); }
      };
      ui.seek.setPointerCapture(e.pointerId);
      move(e);
      ui.seek.addEventListener('pointermove', move);
      ui.seek.addEventListener('pointerup', up);
      ui.seek.addEventListener('pointercancel', up);
    });

    function close() {
      if (disposed) return;
      disposed = true;
      clearInterval(timers.count);
      clearInterval(timers.tick);
      clearTimeout(timers.hide);
      clearTimeout(timers.watch);
      clearTimeout(timers.seek);
      window.removeEventListener('keydown', onKey, true);
      adapter?.destroy();
      root.remove();
      background.forEach(n => { n.inert = false; });
      document.documentElement.classList.remove('sp-open');
      if (session === self) session = null;
      onClose?.(items[index].id);
    }

    const self = {close};
    ui.cc.setAttribute('aria-pressed', String(captions));
    background.forEach(n => { n.inert = true; });
    document.documentElement.classList.add('sp-open');
    document.body.append(root);
    window.addEventListener('keydown', onKey, true);
    // Also notices removal by older app builds, whose Back button deletes #fs-player directly.
    timers.tick = setInterval(() => { if (!root.isConnected) close(); else if (uiOn) tick(); }, 250);
    root.focus({preventScroll: true});
    load(index);
    return self;
  }

  return {
    open({items, index = 0, label = '', onClose}) {
      session?.close();
      session = create(items, index, label, onClose);
    },
    close: () => session?.close(),
    isOpen: () => !!session,
  };
})();
