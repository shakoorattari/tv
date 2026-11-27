'use strict';

const Offline = (() => {
  const worker = navigator.serviceWorker;
  const ready = worker?.register('./sw.js').then(() => worker.ready);
  ready?.catch(() => {});

  async function request(action, owner, value) {
    if (!ready) throw Error('Offline storage needs a secure connection and a browser with offline support.');
    const registration = await ready;
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => {
        channel.port1.close();
        reject(Error('Offline storage took too long. Try again.'));
      }, 11 * 60_000);
      channel.port1.onmessage = ({data}) => {
        clearTimeout(timer);
        channel.port1.close();
        if (data.error) reject(Error(data.error));
        else resolve(data.data);
      };
      registration.active.postMessage({action, owner, value}, [channel.port2]);
    });
  }

  return {request};
})();
