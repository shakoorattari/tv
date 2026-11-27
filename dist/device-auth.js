const statusMessages = {
  access_denied: 'Google sign-in was cancelled.',
  expired_token: 'This code expired. Start Google sign-in again.',
};

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, {once: true});
  });
}

export async function signInOnPhone(relay, {showCode, signal}) {
  const base = new URL(relay);
  if (base.protocol !== 'https:' || base.username || base.password) throw Error('Phone sign-in needs a secure setup.');
  async function exchange(path, body) {
    const response = await fetch(new URL(path, base), {
      method: 'POST', body, signal, credentials: 'omit', cache: 'no-store', redirect: 'error',
    });
    const data = await response.json();
    if (data.error === 'busy') throw Error('Google sign-in is busy. Try again in a moment.');
    if (!response.ok) throw Error('Phone sign-in is unavailable. Try again in a moment.');
    return data;
  }

  const device = await exchange('/start');
  const verification = new URL(device.verification_url);
  if (verification.origin !== 'https://www.google.com' || verification.pathname !== '/device' ||
      typeof device.user_code !== 'string' || !/^[A-Z0-9-]{1,15}$/i.test(device.user_code) ||
      typeof device.device_code !== 'string' || !Number.isFinite(device.expires_in) || device.expires_in <= 0) {
    throw Error('Google did not return a valid sign-in code. Try again.');
  }
  const deadline = Date.now() + device.expires_in * 1000;
  let interval = Math.max(5, Number(device.interval) || 5) * 1000;
  showCode({code: device.user_code, url: verification.href});

  while (Date.now() + interval < deadline) {
    await wait(interval, signal);
    if (Date.now() >= deadline) break;
    const result = await exchange('/poll', device.device_code);
    if (signal.aborted) throw signal.reason;
    if (result.id_token) return result.id_token;
    if (result.status === 'slow_down') interval += 5000;
    else if (result.status !== 'authorization_pending') {
      throw Error(statusMessages[result.status] || 'Google sign-in did not finish. Try again.');
    }
  }
  throw Error(statusMessages.expired_token);
}
