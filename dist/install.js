'use strict';
// Detects the device and invites Android browser visitors to install (or open) the Android app.
const AppInstall = (() => {
  const ua = navigator.userAgent;
  const inApp = ua.includes('StrandTVAndroid/');
  const android = !inApp && /Android/i.test(ua);
  const apple = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const apk = new URL('./strand-tv.apk', location.href).href;
  // Chrome and Samsung Internet open the app when it's installed and download the APK when it isn't.
  const openOrInstall = 'intent://open#Intent;scheme=strandtv;package=com.shakoorattari.strandtv;S.browser_fallback_url=' +
    encodeURIComponent(apk) + ';end';
  const SNOOZE_KEY = 'strand.appPrompt', SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

  function snooze() {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)); } catch {}
  }

  function steps() {
    show('Install Strand TV', '<ol class="install-steps">' +
      '<li>Open <strong>strand-tv.apk</strong> from the download notification or your Downloads folder.</li>' +
      '<li>If Android asks, allow your browser to install apps.</li>' +
      '<li>Tap <strong>Install</strong>, then <strong>Open</strong>.</li></ol>' +
      '<p class="muted">If the download didn’t start, <a href="./strand-tv.apk" download>download the app here</a>.</p>' +
      '<div class="actions"><button class="primary" id="installDone">Got it</button></div>');
    $('#installDone').onclick = () => modal.close();
    $('#installDone').focus();
  }

  // When the app opens, the page goes to the background; otherwise the APK is downloading, so explain the next steps.
  function get() {
    snooze();
    document.querySelector('.app-banner')?.remove();
    location.href = openOrInstall;
    setTimeout(() => { if (!document.hidden) steps(); }, 1500);
  }

  function banner() {
    if (!android) return;
    let until = 0;
    try { until = Number(localStorage.getItem(SNOOZE_KEY)) || 0; } catch {}
    if (Date.now() < until) return;
    const el = document.createElement('aside');
    el.className = 'app-banner';
    el.setAttribute('aria-label', 'Strand TV app');
    el.innerHTML = '<div class="app-banner-text"><strong>Watch in the Strand TV app</strong><span>Full-screen playback that rotates with your phone, and automatic updates.</span></div>' +
      '<div class="app-banner-actions"><button data-later>Not now</button><button class="primary" data-get>Get the app</button></div>';
    el.querySelector('[data-get]').onclick = get;
    el.querySelector('[data-later]').onclick = () => { snooze(); el.remove(); };
    document.body.append(el);
  }

  return {android, apple, inApp, get, banner};
})();
