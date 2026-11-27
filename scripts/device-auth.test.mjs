import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {test} from 'node:test';
import {signInOnPhone} from '../dist/device-auth.js';
import relay from '../worker/device-auth.mjs';

const origin = 'https://shakoorattari.com';
const relayOrigin = 'https://strand-auth.example';
const code = {
  device_code: 'opaque-device-code', user_code: 'STRD-1234',
  verification_url: 'https://www.google.com/device', expires_in: 60, interval: 5,
};

test('relay keeps Google credentials and unused tokens on the server', async t => {
  const env = {GOOGLE_DEVICE_CLIENT_ID: 'test-client', GOOGLE_DEVICE_CLIENT_SECRET: 'test-secret'};
  t.mock.method(globalThis, 'fetch', async (url, {body}) => {
    if (url.endsWith('/device/code')) {
      assert.equal(body.get('scope'), 'openid email profile');
      assert.equal(body.has('client_secret'), false);
      return Response.json(code);
    }
    assert.equal(body.get('client_secret'), 'test-secret');
    assert.equal(body.get('device_code'), code.device_code);
    return Response.json({id_token: 'google-id-token', access_token: 'ignored', refresh_token: 'ignored'});
  });
  const request = (path, body, requestOrigin = origin) =>
    new Request(relayOrigin + path, {method: 'POST', headers: {Origin: requestOrigin}, body});
  assert.equal((await relay.fetch(request('/start', null, 'https://other.example'), env)).status, 403);
  assert.deepEqual(await (await relay.fetch(request('/start'), env)).json(), code);
  const response = await relay.fetch(request('/poll', code.device_code), env);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.deepEqual(await response.json(), {id_token: 'google-id-token'});
});

test('TV displays the code, follows Google’s polling interval, and returns the ID token', async t => {
  t.mock.timers.enable({apis: ['setTimeout', 'Date'], now: 10000});
  const calls = [];
  const results = [{status: 'slow_down'}, {status: 'authorization_pending'}, {id_token: 'google-id-token'}];
  t.mock.method(globalThis, 'fetch', async (url, {body, credentials}) => {
    assert.equal(credentials, 'omit');
    if (url.pathname === '/start') return Response.json(code);
    assert.equal(body, code.device_code);
    calls.push(Date.now());
    return Response.json(results.shift());
  });
  let info;
  const operation = signInOnPhone(relayOrigin, {
    showCode: value => {info = value},
    signal: new AbortController().signal,
  });
  await setImmediate();
  assert.deepEqual(info, {code: code.user_code, url: code.verification_url});
  t.mock.timers.tick(5000);
  await setImmediate();
  t.mock.timers.tick(10000);
  await setImmediate();
  t.mock.timers.tick(10000);
  assert.equal(await operation, 'google-id-token');
  assert.deepEqual(calls, [15000, 25000, 35000]);
});

test('cancelling the TV dialog stops polling', async t => {
  const cancel = new AbortController();
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json(code));
  const operation = signInOnPhone(relayOrigin, {
    showCode: () => cancel.abort(),
    signal: cancel.signal,
  });
  await assert.rejects(operation, {name: 'AbortError'});
  assert.equal(fetch.mock.callCount(), 1);
});
