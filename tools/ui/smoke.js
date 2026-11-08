/* Smoke test (tools/ui_test.py runs it at 1280 px and at 390 px): every page address opens without errors, is not
   empty and doesn't scroll sideways: as a guest (incl. one real fight to the results screen, a monster card, the mic
   tuning dialog with Chrome's fake mic), then as a new member (sign-up in the dialog, progress synced), then as admin
   (tools/ui/promote.py ticks is_admin over Uplink; sign out + in to pick it up). Python/JS errors are also caught by
   ui_test.py from the browser log. Resolves to {ok, log}. */
(async function () {
  const log = [], bad = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, what, ms) {
    const end = Date.now() + (ms || 20000);
    while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(150); }
    throw new Error('timed out waiting for: ' + what);
  }
  const q = (s, root) => (root || document).querySelector(s);
  const qa = (s, root) => Array.from((root || document).querySelectorAll(s));
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const errs = [];
  window.addEventListener('error', (e) => errs.push(String(e.message || e)));
  function type(input, value) {
    input.focus(); input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function button(re, root) { return qa((root ? root + ' ' : '') + 'button').find((b) => re.test(b.textContent) && visible(b)); }
  const modal = () => qa('.anvil-modal').find((m) => visible(m) && (m.classList.contains('in') || getComputedStyle(m).display !== 'none'));
  async function noModal() { await until(() => !modal(), 'the dialog to close', 10000); await sleep(300); }

  async function open(hash, expect, landed) {
    if (location.hash !== hash) window.UI_READY = false;
    location.hash = hash;
    await until(() => window.UI_READY && (landed ? location.hash === landed : location.hash === hash), hash, 30000);
    await sleep(700);
    const main = q('.ui-main');
    const text = main ? main.innerText.trim() : '';
    const w = document.documentElement.scrollWidth, vw = screen.width <= 500 ? screen.width : window.innerWidth;
    const problems = [];
    if (text.length < 40) problems.push('empty page');
    if (expect && !new RegExp(expect.source, 'i').test(text)) problems.push('missing ' + expect);
    if (w > vw + 1) {
      const wide = qa('body *').filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.right > vw + 1; })
        .slice(0, 3).map((e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ').slice(0, 2).join('.'));
      problems.push('scrolls sideways (' + w + ' > ' + vw + ') ' + wide.join(' '));
    }
    if (errs.length) problems.push('errors: ' + errs.splice(0).join(' / '));
    if (problems.length) bad.push(hash + ': ' + problems.join('; '));
    log.push((problems.length ? 'BAD  ' : 'ok   ') + hash + (landed && landed !== hash ? ' -> ' + landed : ''));
  }

  async function fight() {
    const S = window.PF.debug.state;
    S.settings.mic = false;   // tap to count (the fake mic beeps would count too, but taps are predictable)
    S.settings.length = 1;    // one fight
    await open('#fight/standing', /Fight 1/);
    if (!q('.fight .mframe svg.monster-svg')) bad.push('#fight: no monster drawn');
    if (q('.ui-shell .topbar') && visible(q('.ui-shell .topbar'))) bad.push('#fight: the top bar should be hidden');
    await until(() => q('#overlay') && !q('#overlay').classList.contains('show'), 'the countdown to end', 10000);
    const before = S.totals.reps;
    for (let i = 0; i < 40 && !q('#overlay.show.cap'); i++) {
      q('#stage').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      await sleep(60);
    }
    await until(() => q('#overlay.show.cap'), 'the capture card', 10000);
    if (S.totals.reps <= before) bad.push('#fight: taps did not count');
    log.push('ok   fight: ' + (S.totals.reps - before) + ' reps, captured ' + q('.cap-name').textContent);
    button(/See results/, '#overlay').click();
    await until(() => location.hash === '#summary' && window.UI_READY, 'the results page', 15000);
    await sleep(600);
    const text = q('.ui-main').innerText;
    if (!/Victory/i.test(text) || !q('.summary .mcard')) bad.push('#summary: no victory / captured card');
    log.push('ok   #summary after the fight');
    // the first finished session asks about move reminders (once per device)
    try { await until(() => modal() && /nudge to move/.test(modal().innerText), 'the reminders question', 4000); } catch (e) { bad.push('no reminders question after the first session'); }
    if (modal()) { button(/Not now/, '.anvil-modal').click(); await noModal(); }
  }

  async function signUp(email, password) {
    await open('#me', /Settings/);
    button(/Create account/).click();
    await until(() => q('.dlg.auth input[type=email]'), 'the sign-up dialog');
    await sleep(300);
    const pw = qa('.dlg.auth input[type=password]');
    type(q('.dlg.auth input[type=email]'), email); type(pw[0], password); type(pw[1], password);
    const tick = q('.dlg.auth input[type=checkbox]'); if (tick && !tick.checked) tick.click();
    button(/^\s*Create account\s*$/, '.dlg.auth').click();
    const end = Date.now() + 30000;
    while (Date.now() < end) {
      if (!modal() && q('.acct-email') && visible(q('.acct-email'))) return true;
      const msg = q('.dlg.auth .anvil-role-msg-error');
      if (msg && visible(msg) && msg.textContent.trim()) { log.push('sign-up said: ' + msg.textContent.trim()); return false; }
      await sleep(200);
    }
    log.push('sign-up: no account panel; dialog: ' + (modal() ? modal().innerText.replace(/\s+/g, ' ').slice(0, 300) : 'closed') + ' | tick: ' + !!q('.dlg.auth input[type=checkbox]'));
    return false;
  }
  async function signIn(email, password) {
    await open('#me', /Settings/);
    button(/^\s*Sign in\s*$/).click();
    await until(() => q('.dlg.auth input[type=password]'), 'the sign-in dialog');
    await sleep(300);
    type(q('.dlg.auth input[type=email]'), email); type(q('.dlg.auth input[type=password]'), password);
    button(/^\s*Sign in\s*$/, '.dlg.auth').click();
    await until(() => !modal() && q('.acct-email') && visible(q('.acct-email')), 'signed in as ' + email, 30000);
  }
  async function signOut() {
    await open('#me', /Account/);
    button(/Sign out/, '.ui-main').click();
    await until(() => modal() && button(/^\s*Sign out\s*$/, '.anvil-modal-footer'), 'the sign-out question');
    button(/^\s*Sign out\s*$/, '.anvil-modal-footer').click();
    await until(() => !modal() && visible(q('.acct-promo')), 'signed out', 30000);
    await sleep(400);
  }

  try {
    // ---- a guest
    await open('#home', /Where are you/);
    if (qa('.positions .pos-btn').length !== 3) bad.push('#home: expected 3 places to fight');
    if (!q('.footer, .pf-footer') || !/Submit feedback/.test(q('.pf-footer').innerText) || !/arkvital\.com/.test(q('.pf-footer').innerText)) bad.push('footer links missing');
    await open('#collection', /monsters captured/);
    await open('#collection/office', /Office/);
    await open('#collection/lounge', /Lounge/);
    q('.cards .mcard').click();
    await until(() => modal() && q('.mdetail'), 'the monster card');
    await sleep(300);
    button(/Close/, '.mdetail').click();
    await noModal();
    await open('#shop', /Lures/);
    await open('#me', /Settings/);
    button(/^\s*Open\s*$/, '.settings').click();   // Tune the mic
    await until(() => modal() && q('.mictest'), 'the mic dialog');
    await sleep(2500);
    log.push('ok   mic dialog: ' + q('.mictest [role=status]').textContent.trim().slice(0, 60) + ' · heard ' + q('#tCount').textContent);
    button(/Done/, '.mictest').click();
    await noModal();
    await open('#admin', /Settings/, '#me');     // admins only: guests land on Me
    await open('#summary', /Where are you/, '#home');  // no session yet: Home
    await fight();
    await open('#collection', /1 of 36|monsters captured/);
    await open('#home', /punch card/);

    // ---- a new member: the guest progress comes along
    const pw = 'Pf-' + Math.random().toString(36).slice(2) + '-Zq8';
    const ok = await signUp('smoke' + Date.now() + '@smoke.test', pw);
    if (!ok) throw new Error('sign-up failed');
    await until(() => /Saved to your account|Ready/.test(q('.sync-status').innerText), 'the first sync', 20000);
    log.push('ok   member: ' + q('.sync-status').innerText.trim());
    for (const [h, re] of [['#home', /Where are you/], ['#collection', /captured/], ['#shop', /Arenas/], ['#me', /Account/]]) await open(h, re);
    await signOut();

    // ---- admin
    const adminEmail = 'admin-' + Date.now() + '@smoke.test';
    if (!(await signUp(adminEmail, pw))) throw new Error('admin sign-up failed');
    await sleep(2500);  // promote.py ticks is_admin within a second or two
    await signOut();
    await signIn(adminEmail, pw);
    await open('#admin', /Feedback inbox/);
    button(/^\s*All/, '.chips-row').click();
    await sleep(1500);
    await open('#me', /Feedback inbox/);
    await signOut();
    log.push(bad.length ? 'PROBLEMS: ' + bad.join(' | ') : 'PASSED');
    return { ok: !bad.length, log: log };
  } catch (e) {
    log.push(String(e && e.message || e));
    if (bad.length) log.push('PROBLEMS: ' + bad.join(' | '));
    return { ok: false, log: log };
  }
})();
