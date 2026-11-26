'use strict';
// Versions and release notes for the web and Android apps, all read from changelog.json.
const Releases = (() => {
  const PLATFORMS = [['web', 'Web app'], ['android', 'Android app']];
  let pending;
  const load = () => pending ??= fetch('./changelog.json', {cache: 'no-cache'})
    .then(res => res.ok ? res.json() : Promise.reject(Error(res.status)))
    .catch(err => { pending = null; throw err; });

  const parts = v => String(v || '').split('.').map(n => Number(n) || 0);
  const isNewer = (a, b) => {
    const [x, y] = [parts(a), parts(b)];
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
    return false;
  };
  const day = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'});

  // Builds from before 1.3.0 report only their build number, not a version name.
  const installedApp = () => {
    const code = navigator.userAgent.match(/StrandTVAndroid\/(\d+)/)?.[1];
    return code ? {code, name: navigator.userAgent.match(/StrandTVApp\/(\d+\.\d+\.\d+)/)?.[1] || ''} : null;
  };
  const running = log => ({web: window.STRAND_VERSION || log.web[0].version, android: installedApp()?.name || ''});

  function card(label, version, detail, extra = '') {
    return '<div class="version-card"><span class="eyebrow">' + esc(label) + '</span><strong>' + esc(version) + '</strong><small>' +
      esc(detail) + '</small>' + extra + '</div>';
  }

  function versions(log) {
    const web = card('Web app', running(log).web, window.STRAND_BUILD ? 'Build ' + window.STRAND_BUILD.slice(0, 7) : 'Local build');
    const latest = log.android[0].version, app = installedApp();
    if (!app) {
      return web + card('Android app', latest, 'Latest release', '<a class="button" href="./strand-tv.apk" download>Download for Android TV</a>');
    }
    const outdated = !app.name || isNewer(latest, app.name);
    return web + card('Android app', app.name || 'Build ' + app.code, app.name ? 'Installed on this device · build ' + app.code : 'Installed on this device',
      outdated ? '<small class="update-note">Version ' + esc(latest) + ' is available</small>' : '');
  }

  function release(r, current) {
    return '<article class="release" tabindex="0"><div class="release-head"><strong>' + esc(r.version) + '</strong>' +
      (r.version === current ? '<span class="badge">On this device</span>' : '') +
      '<time datetime="' + esc(r.date) + '">' + esc(day(r.date)) + '</time></div><ul>' +
      r.changes.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul></article>';
  }

  async function page(main) {
    main.innerHTML = '<section class="page"><div class="eyebrow">Strand TV</div><h1>About</h1>' +
      '<p class="muted">Versions on this device and everything that has changed.</p></section><div id="releases"><p class="muted">Loading…</p></div>';
    let log;
    try { log = await load(); } catch { log = null; }
    const target = document.getElementById('releases');
    if (!target) return;
    if (!log) { target.innerHTML = '<p class="err">Release notes couldn’t be loaded. Check the connection and open this page again.</p>'; return; }
    const now = running(log);
    target.innerHTML = '<div class="versions">' + versions(log) + '</div><div class="bar"><h2>What’s new</h2></div><div class="changelog">' +
      PLATFORMS.map(([key, label]) => '<section><h3>' + label + '</h3>' + log[key].map(r => release(r, now[key])).join('') + '</section>').join('') + '</div>';
  }

  // After an update, list what changed since this device last opened Strand TV; the first visit only records versions.
  async function announce() {
    let log;
    try { log = await load(); } catch { return; }
    const now = running(log);
    let seen = null;
    try { seen = JSON.parse(localStorage.getItem('strand.seen')); } catch {}
    try { localStorage.setItem('strand.seen', JSON.stringify(now)); } catch {}
    if (!seen) return;
    const groups = PLATFORMS.map(([key, label]) => {
      if (!now[key] || !seen[key]) return '';
      const fresh = log[key].filter(r => isNewer(r.version, seen[key]) && !isNewer(r.version, now[key]));
      return fresh.map(r => '<h3>' + label + ' ' + esc(r.version) + '</h3><ul>' + r.changes.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>').join('');
    }).join('');
    if (!groups) return;
    const ask = () => {
      if (StrandPlayer.isOpen() || modal.open) return void setTimeout(ask, 5000);
      show('What’s new in Strand TV', '<div class="whats-new">' + groups + '</div><div class="actions">' +
        '<button class="primary" id="gotIt">Got it</button><a class="button" href="#about" id="allChanges">All changes</a></div>');
      $('#gotIt').onclick = () => modal.close();
      $('#allChanges').onclick = () => modal.close();
      $('#gotIt').focus();
    };
    ask();
  }

  function footer() {
    const link = document.querySelector('.version-link');
    if (!link) return;
    const label = v => { link.textContent = 'Strand TV ' + v + ' · What’s new'; };
    if (window.STRAND_VERSION) label(window.STRAND_VERSION);
    else load().then(log => label(log.web[0].version), () => {});
  }

  return {page, announce, footer};
})();
