// Talks to the Anvil page that hosts the game in an iframe (client_code/Main).
// Messages are JSON strings sent with postMessage, same origin only.
// When the game runs on its own (no Anvil host), online features are off.

export const hasHost = window.parent !== window;
const pending = new Map();
const listeners = {};
let seq = 0;

window.addEventListener('message', (e) => {
  if (e.source !== window.parent || e.origin !== location.origin || typeof e.data !== 'string') return;
  let msg;
  try { msg = JSON.parse(e.data); } catch (err) { return; }
  if (!msg || msg.pf !== 1) return;
  if (msg.event) {
    (listeners[msg.event] || []).forEach((fn) => fn(msg));
    return;
  }
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  clearTimeout(p.timer);
  if (msg.ok) p.resolve(msg.result);
  else {
    const err = new Error(msg.message || msg.error || 'Something went wrong');
    err.code = msg.error;
    p.reject(err);
  }
});

export function on(event, fn) {
  (listeners[event] = listeners[event] || []).push(fn);
}

export function call(method, args = {}, timeout = 25000) {
  if (!hasHost) {
    const err = new Error('Accounts are available on poundfighter.com');
    err.code = 'NoHost';
    return Promise.reject(err);
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      const err = new Error('The server took too long to answer. Check your connection.');
      err.code = 'Timeout';
      reject(err);
    }, timeout);
    pending.set(id, { resolve, reject, timer });
    window.parent.postMessage(JSON.stringify({ pf: 1, id, method, args }), location.origin);
  });
}

// Call an Anvil server function through the host (only whitelisted names work)
export const server = (name, ...args) => call('call', { name, args });

// The host form may still be starting when we load, so retry the first hello
export async function hello() {
  for (let i = 0; i < 4; i++) {
    try {
      return await call('hello', {}, 2500 + i * 2500);
    } catch (e) {
      if (e.code !== 'Timeout') throw e;
    }
  }
  throw Object.assign(new Error('Could not reach the server'), { code: 'Timeout' });
}
