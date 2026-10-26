// Accounts, progress sync, feedback and the admin feedback inbox.
// All server work goes through the Anvil host page (bridge.js).

import { call, server, hello, hasHost, on } from './bridge.js';
import * as store from './store.js';
import { esc, I, toast, openModal, closeModal, $, timeAgo } from './ui.js';

export const APP_VERSION = '3.0.0';

// Privacy & Terms: the page itself opens in the Anvil host (over the game); this frame only shows links
// and the sign-up tick box (legal-kit.js, loaded in index.html).
const LK = window.LegalKit || null;
if (LK && hasHost) LK.setOpenHandler((tab) => call('legal_open', { tab }).catch(() => {}));
const legalLink = (text = 'Privacy &amp; Terms', tab = 'overview') =>
  LK ? `<button type="button" class="link" data-lk-open="${tab}">${text}</button>` : '';

export const online = {
  status: hasHost ? 'connecting' : 'offline', // connecting | ready | offline | error
  account: null, // { email, is_admin }
  installable: false,
  syncing: false,
  lastSync: 0,
  syncError: null,
  admin: { filter: 'new', data: null, loading: false, error: null },
};

let ctx = null;
let syncTimer = 0;
let syncQueued = false;

// ctx: { getS, setS, saveLocal, refresh, go, route, contextInfo }
export function initOnline(c) {
  ctx = c;
  if (!hasHost) return;
  on('installable', () => { online.installable = true; ctx.refresh(); });
  on('installed', () => { online.installable = false; toast(`${I.check} PoundFighter installed!`); ctx.refresh(); });
  boot();
}

async function boot() {
  try {
    const r = await hello();
    online.status = 'ready';
    online.installable = !!(r && r.installable);
    online.account = (r && r.account) || null;
    if (online.account) await syncNow();
  } catch (e) {
    online.status = 'error';
    online.syncError = e.message;
  }
  ctx.refresh();
}

// ---------------------------------------------------------------- sync

// Called after every local save; batches changes into one sync a few seconds later
export function scheduleSync(delay = 4000) {
  if (!online.account) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, delay);
}

export async function syncNow() {
  if (!online.account) return;
  if (online.syncing) { syncQueued = true; return; }
  clearTimeout(syncTimer);
  online.syncing = true;
  const email = online.account.email;
  try {
    const S = ctx.getS();
    if (S.owner && S.owner !== email) {
      // This device holds someone else's progress: switch to this account's copy
      const remote = await server('sync_progress', null);
      const next = store.fromData(remote || {});
      next.settings = S.settings;
      next.owner = email;
      ctx.setS(next);
      if (!remote) await server('sync_progress', JSON.parse(JSON.stringify(next)));
    } else {
      S.owner = email;
      const merged = await server('sync_progress', JSON.parse(JSON.stringify(S)));
      // Merge again in case something changed while we waited
      const next = store.fromData(store.mergeStates(merged, ctx.getS()));
      next.owner = email;
      ctx.setS(next);
    }
    ctx.saveLocal();
    online.lastSync = Date.now();
    online.syncError = null;
  } catch (e) {
    online.syncError = e.message;
    if (e.code === 'PermissionDenied' || /log/i.test(e.code || '')) online.account = null; // session ended
  } finally {
    online.syncing = false;
    if (syncQueued) { syncQueued = false; scheduleSync(1500); }
    ctx.refresh();
  }
}

// ---------------------------------------------------------------- account UI

const AUTH_ERRORS = {
  AuthenticationFailed: 'Wrong email or password.',
  UserExists: 'There is already an account with that email. Try signing in.',
  EmailNotConfirmed: 'Please confirm your email first. Check your inbox for the link.',
  TooManyPasswordFailures: 'Too many tries. Reset your password, or wait a little and try again.',
  AccountIsNotEnabled: 'This account is switched off. Send feedback if that is a mistake.',
};
const errText = (e) => AUTH_ERRORS[e.code] || e.message || 'Something went wrong. Please try again.';

export function accountPanel() {
  if (!hasHost) {
    return `<section class="panel account muted-panel"><div class="panel-head"><h2>${I.cloud} Account</h2></div>
      <p class="muted small">Accounts and cloud saves work on poundfighter.com. Here, progress is saved on this device.</p></section>`;
  }
  if (online.status === 'connecting') {
    return `<section class="panel account"><div class="panel-head"><h2>${I.cloud} Account</h2></div><p class="muted small">Connecting…</p></section>`;
  }
  if (!online.account) {
    return `<section class="panel account gold-panel">
      <div class="acct-promo">
        <div class="acct-crest">${I.shield}</div>
        <div><h2>Save your progress</h2>
        <p class="small">Keep your monsters, pounds and streak safe in a free account, and play on your phone and computer.</p></div>
      </div>
      ${online.status === 'error' ? `<p class="form-error">Could not reach the server: ${esc(online.syncError || '')}</p>` : ''}
      <div class="row-btns">
        <button class="btn" data-action="auth" data-mode="signin">Sign in</button>
        <button class="btn gold" data-action="auth" data-mode="signup">Create account</button>
      </div>
      <p class="small muted">${legalLink()}</p>
    </section>`;
  }
  const a = online.account;
  const status = online.syncing ? `${I.cloud} Saving…`
    : online.syncError ? `<span class="warn-text">Not saved: ${esc(online.syncError)}</span> <button class="link" data-action="sync-now">Retry</button>`
    : online.lastSync ? `${I.cloudCheck} Saved to your account ${timeAgo(online.lastSync)}` : `${I.cloud} Ready`;
  return `<section class="panel account">
    <div class="panel-head"><h2>${I.user} Account</h2>${a.is_admin ? `<span class="admin-tag">${I.crown} Admin</span>` : ''}</div>
    <div class="acct-row"><b class="acct-email">${esc(a.email)}</b><span class="small muted sync-status">${status}</span></div>
    ${a.is_admin ? `<button class="btn gold" data-action="go" data-to="admin">${I.inbox} Feedback inbox</button>` : ''}
    <div class="row-btns">
      <button class="btn small" data-action="change-password">${I.key} Change password</button>
      <button class="btn small" data-action="logout">${I.logout} Sign out</button>
    </div>
    <p class="small muted">${legalLink()}</p>
  </section>`;
}

export function openAuth(mode = 'signin') {
  const S = ctx.getS();
  const hasGuestProgress = !S.owner && (S.xp > 0 || store.uniqueCaught(S) > 0);
  const titles = { signin: 'Welcome back', signup: 'Create your account', forgot: 'Reset your password' };
  const blurbs = {
    signin: hasGuestProgress ? 'Your progress on this device will be added to your account.' : 'Pick up where you left off.',
    signup: hasGuestProgress ? 'Everything you have caught so far comes with you.' : 'Free. Keeps your monsters safe on every device.',
    forgot: 'We will email you a link to choose a new password.',
  };
  const submit = { signin: 'Sign in', signup: 'Create account', forgot: 'Send reset link' }[mode];
  openModal(`<form class="auth" data-form="auth" data-mode="${mode}" novalidate>
    <div class="auth-head"><div class="acct-crest">${mode === 'forgot' ? I.key : I.shield}</div><h3>${titles[mode]}</h3><p class="muted small">${blurbs[mode]}</p></div>
    <label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>
    ${mode !== 'forgot' ? `<label class="field"><span>Password</span><input type="password" name="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" required minlength="${mode === 'signup' ? 8 : 1}"></label>` : ''}
    ${mode === 'signup' ? `<label class="field"><span>Password again</span><input type="password" name="password2" autocomplete="new-password" required></label>` : ''}
    ${mode === 'signup' && LK ? LK.consentField() : ''}
    <p class="form-error" id="formErr" role="alert"></p>
    <button class="btn gold big" type="submit">${submit}</button>
    <div class="auth-links">
      ${mode === 'signin' ? `<button type="button" class="link" data-action="auth" data-mode="forgot">Forgot password?</button><button type="button" class="link" data-action="auth" data-mode="signup">New here? Create an account</button>` : ''}
      ${mode !== 'signin' ? `<button type="button" class="link" data-action="auth" data-mode="signin">I already have an account</button>` : ''}
    </div>
  </form>`);
}

function openChangePassword() {
  openModal(`<form class="auth" data-form="password" novalidate>
    <div class="auth-head"><div class="acct-crest">${I.key}</div><h3>Change password</h3><p class="muted small">${esc(online.account.email)}</p></div>
    <label class="field"><span>Current password</span><input type="password" name="old" autocomplete="current-password" required></label>
    <label class="field"><span>New password</span><input type="password" name="new1" autocomplete="new-password" required minlength="8"></label>
    <label class="field"><span>New password again</span><input type="password" name="new2" autocomplete="new-password" required></label>
    <p class="form-error" id="formErr" role="alert"></p>
    <div class="row-btns"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn gold" type="submit">Save</button></div>
  </form>`);
}

const setErr = (msg) => { const el = $('formErr'); if (el) el.textContent = msg || ''; };
const busy = (form, on) => form.querySelectorAll('button, input, textarea, select').forEach((el) => { el.disabled = on; });

async function onAuthSubmit(form) {
  const mode = form.dataset.mode;
  const email = form.email.value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('Please enter a valid email address.');
  if (mode === 'forgot') {
    busy(form, true);
    try { await call('forgot', { email }); } catch (e) { /* same answer either way */ }
    closeModal();
    toast(`${I.check} If ${esc(email)} has an account, a reset link is on its way.`);
    return;
  }
  const password = form.password.value;
  if (!password) return setErr('Please enter your password.');
  if (mode === 'signup') {
    if (password.length < 8) return setErr('Use at least 8 characters for your password.');
    if (password !== form.password2.value) return setErr('The two passwords do not match.');
    if (LK && !LK.consentChecked(form)) return setErr('');
  }
  setErr('');
  busy(form, true);
  try {
    const result = await call(mode === 'signup' ? 'signup' : 'login', { email, password });
    if (result && result.needs_confirmation) {
      closeModal();
      toast(`${I.check} Account created. Check your email to confirm it, then sign in.`);
      return;
    }
    online.account = result;
    closeModal();
    toast(`${I.check} ${mode === 'signup' ? 'Account created' : 'Signed in'}. Saving your progress…`);
    await syncNow();
  } catch (e) {
    busy(form, false);
    setErr(errText(e));
  }
}

async function onPasswordSubmit(form) {
  const old = form.old.value, n1 = form.new1.value, n2 = form.new2.value;
  if (!old) return setErr('Please enter your current password.');
  if (n1.length < 8) return setErr('Use at least 8 characters for the new password.');
  if (n1 !== n2) return setErr('The two new passwords do not match.');
  busy(form, true);
  try {
    await call('change_password', { old_password: old, new_password: n1 });
    closeModal();
    toast(`${I.check} Password changed.`);
  } catch (e) {
    if (/ResetByEmail/.test(e.message)) {
      await call('forgot', { email: online.account.email }).catch(() => {});
      closeModal();
      toast(`We emailed you a link to set a new password.`);
      return;
    }
    busy(form, false);
    setErr(errText(e));
  }
}

function confirmLogout() {
  openModal(`<div class="confirm"><h3>Sign out?</h3>
    <p class="muted">Your progress is saved in your account. This device will start fresh until you sign in again.</p>
    <div class="row-btns"><button class="btn" data-action="close-modal">Stay signed in</button><button class="btn primary" data-action="logout-yes">Sign out</button></div></div>`);
}

async function doLogout() {
  closeModal();
  try { await syncNow(); } catch (e) { /* best effort */ }
  try { await call('logout'); } catch (e) { /* still clear locally */ }
  online.account = null;
  online.lastSync = 0;
  const S = ctx.getS();
  ctx.setS(store.resetAll(S.settings));
  ctx.saveLocal();
  toast('Signed out. Your progress is safe in your account.');
  if (ctx.route() === 'admin') ctx.go('me');
  else ctx.refresh();
}

// ---------------------------------------------------------------- feedback

export function openFeedback(kind = 'bug') {
  const kinds = [['bug', 'Bug'], ['idea', 'Idea'], ['other', 'Other']];
  openModal(`<form class="fb-form" data-form="feedback" novalidate>
    <h3>${I.bug} Send feedback</h3>
    <p class="muted small">Found a bug or have an idea? It goes straight to the person who builds PoundFighter.</p>
    <div class="seg kinds" role="radiogroup" aria-label="Type">
      ${kinds.map(([k, label]) => `<label class="seg-btn ${k === kind ? 'on' : ''}"><input type="radio" name="kind" value="${k}" ${k === kind ? 'checked' : ''}><b>${label}</b></label>`).join('')}
    </div>
    <label class="field"><span>What happened?</span>
      <textarea name="message" rows="5" maxlength="4000" required placeholder="What did you do, what did you expect, and what happened instead?"></textarea></label>
    ${online.account ? '' : `<label class="field"><span>Your email <i class="muted">(optional, so we can reply)</i></span><input type="email" name="email" autocomplete="email"></label>`}
    <label class="check"><input type="checkbox" name="withInfo"> Include device info (browser, screen size, app version)</label>
    ${LK ? `<p class="small muted">How we use what you send: ${legalLink('Privacy Policy', 'privacy')}</p>` : ''}
    <p class="form-error" id="formErr" role="alert"></p>
    <div class="row-btns"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn gold" type="submit">Send</button></div>
  </form>`);
}

async function onFeedbackSubmit(form) {
  const message = form.message.value.trim();
  if (message.length < 5) return setErr('Please tell us a little more.');
  const kind = (form.querySelector('input[name=kind]:checked') || {}).value || 'other';
  const email = form.email ? form.email.value.trim() : null;
  const context = form.withInfo.checked ? { version: APP_VERSION, ...ctx.contextInfo() } : { version: APP_VERSION };
  busy(form, true);
  try {
    await server('submit_feedback', kind, message, email, context);
    closeModal();
    toast(`${I.check} Thanks! Your feedback was sent.`);
  } catch (e) {
    busy(form, false);
    setErr(errText(e));
  }
}

// ---------------------------------------------------------------- admin inbox

const STATUSES = [['new', 'New'], ['reviewing', 'Reviewing'], ['fixed', 'Fixed'], ['wontfix', "Won't fix"]];

export async function loadAdmin() {
  const A = online.admin;
  A.loading = true;
  A.error = null;
  ctx.refresh();
  try {
    A.data = await server('admin_list_feedback', A.filter === 'all' ? null : A.filter);
  } catch (e) {
    A.error = e.code === 'PermissionDenied' ? 'Only admins can see this page.' : e.message;
  }
  A.loading = false;
  ctx.refresh();
}

export function viewAdmin() {
  const A = online.admin;
  const d = A.data;
  const counts = (d && d.counts) || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');
  const items = (d && d.items) || [];
  return `<header class="topbar admin-bar">
    <button class="btn small" data-action="go" data-to="me">← Back</button>
    <span class="admin-tag">${I.crown} Admin</span>
  </header>
  <main class="page admin">
    <section class="page-head">
      <h1 class="gold-text">Feedback inbox</h1>
      <p class="muted small">${d ? `${d.players} player account${d.players === 1 ? '' : 's'} · ${total} message${total === 1 ? '' : 's'}` : ''}</p>
    </section>
    <div class="chips-row">
      ${[...STATUSES, ['all', 'All']].map(([k, label]) => `<button class="fchip ${A.filter === k ? 'on' : ''}" data-action="fb-filter" data-f="${k}">${label}${k !== 'all' && counts[k] !== undefined ? ` <b>${counts[k]}</b>` : k === 'all' && d ? ` <b>${total}</b>` : ''}</button>`).join('')}
      <button class="fchip" data-action="fb-refresh" aria-label="Refresh">↻</button>
    </div>
    ${A.loading ? '<p class="muted">Loading…</p>' : ''}
    ${A.error ? `<p class="form-error">${esc(A.error)}</p>` : ''}
    ${!A.loading && d && !items.length ? `<div class="panel empty"><p class="muted">Nothing here. ${A.filter === 'new' ? 'Inbox zero!' : ''}</p></div>` : ''}
    ${items.map((it) => `<article class="fb-item kind-${esc(it.kind)}" data-id="${esc(it.id)}">
      <div class="fb-top">
        <span class="kind-tag">${esc(it.kind)}</span>
        <span class="small muted">${fmtDate(it.created)}</span>
        <span class="small fb-email">${it.email ? `<a href="mailto:${esc(it.email)}">${esc(it.email)}</a>` : '<i class="muted">anonymous</i>'}</span>
      </div>
      <p class="fb-msg">${esc(it.message)}</p>
      ${it.context && Object.keys(it.context).length ? `<details><summary class="small">Device info</summary><pre>${esc(JSON.stringify(it.context, null, 2))}</pre></details>` : ''}
      <div class="fb-actions">
        <select data-fb="status" aria-label="Status">${STATUSES.map(([k, label]) => `<option value="${k}" ${it.status === k ? 'selected' : ''}>${label}</option>`).join('')}</select>
        <input data-fb="note" placeholder="Private note" value="${esc(it.admin_note)}" aria-label="Note">
        <button class="btn small gold" data-action="fb-save" data-id="${esc(it.id)}">Save</button>
        <button class="btn small danger" data-action="fb-delete" data-id="${esc(it.id)}" aria-label="Delete">${I.trash}</button>
      </div>
    </article>`).join('')}
  </main>`;
}

async function saveFeedbackItem(id) {
  const el = document.querySelector(`.fb-item[data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  const status = el.querySelector('[data-fb=status]').value;
  const note = el.querySelector('[data-fb=note]').value;
  try {
    await server('admin_update_feedback', id, status, note);
    toast(`${I.check} Saved`);
    loadAdmin();
  } catch (e) {
    toast(esc(e.message), 'warn');
  }
}

function confirmDelete(id) {
  openModal(`<div class="confirm"><h3>Delete this message?</h3><p class="muted">This can't be undone.</p>
    <div class="row-btns"><button class="btn" data-action="close-modal">Keep</button><button class="btn danger" data-action="fb-delete-yes" data-id="${esc(id)}">Delete</button></div></div>`);
}

// ---------------------------------------------------------------- events

export const onlineActions = {
  auth: (el) => openAuth(el.dataset.mode),
  'change-password': () => openChangePassword(),
  logout: () => confirmLogout(),
  'logout-yes': () => doLogout(),
  'sync-now': () => syncNow(),
  feedback: (el) => openFeedback(el.dataset.kind || 'bug'),
  'fb-filter': (el) => { online.admin.filter = el.dataset.f; loadAdmin(); },
  'fb-refresh': () => loadAdmin(),
  'fb-save': (el) => saveFeedbackItem(el.dataset.id),
  'fb-delete': (el) => confirmDelete(el.dataset.id),
  'fb-delete-yes': async (el) => {
    closeModal();
    try { await server('admin_delete_feedback', el.dataset.id); toast('Deleted'); } catch (e) { toast(esc(e.message), 'warn'); }
    loadAdmin();
  },
};

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const handlers = { auth: onAuthSubmit, password: onPasswordSubmit, feedback: onFeedbackSubmit };
  const fn = handlers[form.dataset.form];
  if (fn) fn(form);
});

// Feedback type picker
document.addEventListener('change', (e) => {
  if (e.target.name === 'kind' && e.target.closest('.kinds')) {
    e.target.closest('.kinds').querySelectorAll('.seg-btn').forEach((l) => l.classList.toggle('on', l.contains(e.target)));
  }
});
