// "Move reminders": push notifications during the player's workday, plus the
// prompt to install PoundFighter as an app (needed for push on iPhone).
//
// Push flow: service worker (../sw.js) + Push API subscription, stored on the
// server, which sends reminders from a scheduled task (server_code).
// Fallback when push isn't available: local notifications while the app is open.

import { call, server, hasHost } from './bridge.js';
import * as store from './store.js';
import { esc, I, toast, openModal, closeModal } from './ui.js';
import { online } from './online.js';

let ctx = null;
let localTimer = 0;
let lastLocal = 0;
let prefsTimer = 0;

const ua = navigator.userAgent;
export const env = {
  ios: /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  standalone: (() => {
    try {
      return window.matchMedia('(display-mode: standalone)').matches || !!window.top.navigator.standalone;
    } catch (e) {
      return window.matchMedia('(display-mode: standalone)').matches;
    }
  })(),
  notifications: 'Notification' in window,
  push: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext,
};

// Device-only state: { reminders: 'push' | 'local' | null, pushEndpoint, askedReminders }
const device = () => store.deviceGet();
export const remindersOn = () => !!device().reminders;

export function initReminders(c) {
  ctx = c;
  startLocalLoop();
  // Keep the server's copy of this device's timezone and schedule fresh
  const d = device();
  if (d.reminders === 'push' && d.pushEndpoint && hasHost) {
    checkSubscription().then((ok) => {
      if (ok) server('push_update', d.pushEndpoint, prefs(), new Date().getTimezoneOffset()).catch(() => {});
    });
  }
}

const prefs = () => ({ on: true, ...ctx.getS().settings.reminders });

function b64ToBytes(b64) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
const bytesToB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function registration() {
  await navigator.serviceWorker.register('sw.js', { scope: './' });
  return navigator.serviceWorker.ready;
}

async function checkSubscription() {
  try {
    const reg = await navigator.serviceWorker.getRegistration('./');
    const sub = reg && (await reg.pushManager.getSubscription());
    if (!sub) {
      store.deviceSet({ reminders: null, pushEndpoint: null });
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------- enable / disable

export async function enableReminders() {
  if (!env.notifications) {
    if (env.ios && !env.standalone) return showIosInstall();
    toast('This browser can’t show notifications.', 'warn');
    return false;
  }
  if (env.ios && !env.standalone) return showIosInstall();
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    toast('Notifications are blocked. Allow them for poundfighter.com in your browser settings.', 'warn');
    return false;
  }
  if (env.push && hasHost) {
    try {
      const reg = await registration();
      const key = await server('push_public_key');
      let sub = await reg.pushManager.getSubscription();
      const current = sub && sub.options && sub.options.applicationServerKey;
      if (sub && current && bytesToB64(current) !== key) {
        await sub.unsubscribe();
        sub = null;
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
      await server('push_subscribe', sub.toJSON(), prefs(), new Date().getTimezoneOffset());
      store.deviceSet({ reminders: 'push', pushEndpoint: sub.endpoint, askedReminders: true });
      toast(`${I.bell} Reminders on. ${scheduleText()}`);
      ctx.refresh();
      return true;
    } catch (e) {
      console.warn('Push setup failed, using local reminders', e);
    }
  }
  store.deviceSet({ reminders: 'local', askedReminders: true });
  toast(`${I.bell} Reminders on while PoundFighter is open. ${scheduleText()}`);
  ctx.refresh();
  return true;
}

export async function disableReminders() {
  const d = device();
  if (d.reminders === 'push') {
    try {
      const reg = await navigator.serviceWorker.getRegistration('./');
      const sub = reg && (await reg.pushManager.getSubscription());
      if (sub) await sub.unsubscribe();
    } catch (e) { /* already gone */ }
    if (d.pushEndpoint) server('push_unsubscribe', d.pushEndpoint).catch(() => {});
  }
  store.deviceSet({ reminders: null, pushEndpoint: null });
  toast('Reminders off.');
  ctx.refresh();
}

// After a workout, push the next reminder back
export function noteActivity() {
  const d = device();
  if (d.reminders === 'push' && d.pushEndpoint) server('push_activity', d.pushEndpoint).catch(() => {});
}

function pushPrefsSoon() {
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(() => {
    const d = device();
    if (d.reminders === 'push' && d.pushEndpoint) server('push_update', d.pushEndpoint, prefs(), new Date().getTimezoneOffset()).catch(() => {});
  }, 800);
}

const hourText = (h) => (h === 0 || h === 24 ? '12am' : h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`);
export function scheduleText() {
  const p = ctx.getS().settings.reminders;
  return `${p.weekdays ? 'Weekdays' : 'Every day'}, ${hourText(p.start)}–${hourText(p.end)}, every ${p.every} min.`;
}

// ---------------------------------------------------------------- local fallback

function startLocalLoop() {
  clearInterval(localTimer);
  localTimer = setInterval(() => {
    if (device().reminders !== 'local' || ctx.inFight() || Notification.permission !== 'granted') return;
    const p = ctx.getS().settings.reminders;
    const now = new Date();
    if (p.weekdays && (now.getDay() === 0 || now.getDay() === 6)) return;
    if (now.getHours() < p.start || now.getHours() >= p.end) return;
    if (Date.now() - Math.max(ctx.getS().lastSessionAt || 0, lastLocal) < p.every * 60000) return;
    lastLocal = Date.now();
    const title = 'A wild monster appeared!';
    const options = { body: 'One quick fight. Brain off, glutes on.', tag: 'pf-reminder', icon: 'icon-192.png' };
    navigator.serviceWorker?.getRegistration('./')
      .then((reg) => (reg ? reg.showNotification(title, options) : new Notification(title, options)))
      .catch(() => { try { new Notification(title, options); } catch (e) { /* not allowed */ } });
  }, 60000);
}

// ---------------------------------------------------------------- install

export async function installApp() {
  if (env.ios) return showIosInstall();
  try {
    const outcome = await call('install');
    if (outcome === 'accepted') toast(`${I.check} Installing PoundFighter…`);
    online.installable = false;
    ctx.refresh();
  } catch (e) {
    toast('Use your browser menu and choose “Install app” or “Add to Home screen”.');
  }
}

function showIosInstall() {
  openModal(`<div class="confirm install-help">
    <div class="acct-crest">${I.download}</div>
    <h3>Install PoundFighter</h3>
    <p class="muted">On iPhone and iPad, reminders only work once PoundFighter is on your Home Screen.</p>
    <ol class="steps">
      <li>Open poundfighter.com in <b>Safari</b>.</li>
      <li>Tap the <b>Share</b> button ${I.share}</li>
      <li>Choose <b>Add to Home Screen</b>.</li>
      <li>Open PoundFighter from your Home Screen and turn on reminders in <b>Me</b>.</li>
    </ol>
    <div class="row-btns"><button class="btn gold" data-action="close-modal">Got it</button></div>
  </div>`);
  return false;
}

export const canInstall = () => !env.standalone && (online.installable || env.ios);

// ---------------------------------------------------------------- UI

export function remindersPanel() {
  const d = device();
  const p = ctx.getS().settings.reminders;
  const on = !!d.reminders;
  const hours = (sel, from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
    .map((h) => `<option value="${h}" ${h === sel ? 'selected' : ''}>${hourText(h)}</option>`).join('');
  const statusText = !on ? 'Off'
    : d.reminders === 'push' ? `On. ${scheduleText()}`
    : `On while PoundFighter is open. ${scheduleText()}`;
  return `<section class="panel reminders">
    <div class="panel-head"><h2>${I.bell} Move reminders</h2></div>
    <p class="muted small">A nudge during your day to do one quick fight. Sitting less is the whole point.</p>
    ${canInstall() ? `<div class="install-row">
      <div class="acct-crest small">${I.download}</div>
      <div><b>Install the app</b><span class="small muted">${env.ios ? 'Needed for reminders on iPhone.' : 'One tap to open, and reminders that arrive even when it is closed.'}</span></div>
      <button class="btn small gold" data-action="install">Install</button>
    </div>` : env.standalone ? `<p class="small installed">${I.check} Installed as an app</p>` : ''}
    <div class="set-row">
      <span><b>Reminders</b><span class="small muted">${esc(statusText)}</span></span>
      <button class="switch ${on ? 'on' : ''}" data-action="rem-toggle" role="switch" aria-checked="${on}" aria-label="Move reminders"><i></i></button>
    </div>
    <div class="rem-grid ${on ? '' : 'dim'}">
      <label class="field"><span>From</span><select data-rem="start">${hours(p.start, 5, 22)}</select></label>
      <label class="field"><span>Until</span><select data-rem="end">${hours(p.end, 6, 24)}</select></label>
      <label class="field"><span>Every</span><select data-rem="every">${[30, 45, 60, 90, 120].map((n) => `<option value="${n}" ${n === p.every ? 'selected' : ''}>${n} min</option>`).join('')}</select></label>
    </div>
    <div class="set-row">
      <span><b>Weekdays only</b></span>
      <button class="switch ${p.weekdays ? 'on' : ''}" data-action="rem-weekdays" role="switch" aria-checked="${p.weekdays}" aria-label="Weekdays only"><i></i></button>
    </div>
    ${d.reminders === 'push' ? `<button class="btn small" data-action="rem-test">${I.bell} Send me a test notification</button>` : ''}
  </section>`;
}

// Asked once, right after the player's first finished session
export function maybeAskAfterSession() {
  const d = device();
  if (d.askedReminders || d.reminders || !hasHost) return;
  store.deviceSet({ askedReminders: true });
  const needsInstall = env.ios && !env.standalone;
  setTimeout(() => openModal(`<div class="confirm ask-remind">
    <div class="acct-crest big">${I.bell}</div>
    <h3>Want a nudge to move?</h3>
    <p class="muted">Little and often beats one big workout. PoundFighter can remind you to do a one-minute fight during your day.</p>
    <p class="small schedule">${esc(scheduleText())} <span class="muted">You can change this in Me.</span></p>
    ${needsInstall ? `<p class="small muted">On iPhone, add PoundFighter to your Home Screen first.</p>` : ''}
    <div class="row-btns">
      <button class="btn" data-action="close-modal">Not now</button>
      <button class="btn gold" data-action="${needsInstall ? 'install' : 'rem-yes'}">${needsInstall ? 'Show me how' : 'Yes, remind me'}</button>
    </div>
    ${!needsInstall && canInstall() ? `<button class="link" data-action="install">${I.download} Install the app too</button>` : ''}
  </div>`), 900);
}

export const reminderActions = {
  'rem-toggle': () => (remindersOn() ? disableReminders() : enableReminders()),
  'rem-yes': () => { closeModal(); enableReminders(); },
  'rem-weekdays': () => {
    const p = ctx.getS().settings.reminders;
    p.weekdays = !p.weekdays;
    ctx.save();
    pushPrefsSoon();
    ctx.refresh();
  },
  'rem-test': async () => {
    try {
      await server('push_test', device().pushEndpoint);
      toast(`${I.check} Sent! It should pop up in a few seconds.`);
    } catch (e) {
      toast(esc(e.message), 'warn');
    }
  },
  install: () => { closeModal(); installApp(); },
};

document.addEventListener('change', (e) => {
  const k = e.target.dataset && e.target.dataset.rem;
  if (!k || !ctx) return;
  const p = ctx.getS().settings.reminders;
  p[k] = Number(e.target.value);
  if (p.end <= p.start) p.end = Math.min(24, p.start + 1);
  ctx.save();
  pushPrefsSoon();
  ctx.refresh();
});
