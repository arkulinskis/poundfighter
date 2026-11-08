// PoundFighter engine for the native-Forms app (window.PF, wrapped by client_code/pf.py).
//
// What stays JavaScript: the game state and its rules (store.js, data.js), the fight screen (monster fog, HP,
// combos, capture overlays: drawn here into the Arena component), the microphone rep detector (mic.js), sounds
// (sfx.js), music (ark-music.js), monster art (monster-art.js), push subscriptions and the screen wake lock.
// Pages, menus, dialogs and lists are Python Forms: they read plain JSON views from here (PF.home(), PF.shop() ...)
// and call PF.act(name, value) for every change. Python sets PF.hooks (toast, saved, finished, quit, confirmEnd,
// afterSession) so the engine can reach the app.

import * as D from './data.js';
import { monsterSVG, seeded } from './monster-art.js';
import { RepDetector, dbToMeter } from './mic.js';
import { sfx, configureSfx, getAudioContext } from './sfx.js';
import * as store from './store.js';
import { esc, $, fmtNum, fmtTime, I, coin } from './ui.js';

export const APP_VERSION = '4.0.0';

let S = store.load();
const hooks = {};
function hook(name, ...args) {
  const fn = hooks[name];
  if (!fn) return undefined;
  try { return fn(...args); } catch (e) { console.warn('PF hook', name, e); return undefined; }
}
const saveLocal = () => store.save(S);
// Save on this device; Python syncs to the account a few seconds later (signed in only)
const persist = () => {
  store.save(S);
  hook('saved');
};
const J = (x) => JSON.stringify(x === undefined ? null : x);

let route = 'home';
let session = null;
let micTest = null; // { count } while the mic tuning dialog is open
let lastSummary = null;
let host = null; // the Arena component's element while a fight is on screen

const detector = new RepDetector({
  onRep: () => (micTest ? onTestRep() : onRep('mic')),
  onLevel: (snap) => updateMeters(snap),
});

function applySettings() {
  detector.sensitivity = S.settings.sensitivity;
  detector.minGap = S.settings.minGap;
  configureSfx({
    sound: S.settings.sound,
    vibrate: S.settings.vibrate,
    onPlaySound: (ms) => detector.suppress(ms), // don't let our own sounds count as reps
  });
  syncMusic();
}

// ---------- Music: real tracks streamed by ArkMusic (ark-music.js, from APP_MAKER/media) ----------
// Never while the mic counts reps or is being tuned: it would hear the music and count it as reps.
const MUSIC = { menu: ['cosmic', 'dont-stress-out'], fight: ['how-do-you-love'], summary: ['nailed-it', 'cosmic'] };
function syncMusic() {
  const M = window.ArkMusic;
  if (!M) return;
  M.enabled(S.settings.music !== false);
  if (micTest || route === 'admin') return M.stop(0.3);
  if (route === 'fight') return session && session.mic ? M.stop(0.3) : M.play(MUSIC.fight, { volume: 0.5 });
  if (route === 'summary') return M.play(MUSIC.summary, { volume: 0.45 });
  M.play(MUSIC.menu, { volume: 0.4, shuffle: true });
}
applySettings();

// ---------- Small helpers ----------

const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const rarityName = (r) => D.RARITIES[r].name;
const sensLabel = (s) => (s <= 10 ? 'High' : s <= 18 ? 'Medium' : 'Low') + ` (${s} dB)`;
const hourText = (h) => (h === 0 || h === 24 ? '12am' : h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`);

// ---------- Screen wake lock ----------

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { /* not supported or not allowed; the workout still works */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && session) keepAwake(true);
  if (document.visibilityState === 'hidden') persist();
});
window.addEventListener('pagehide', saveLocal);

// ---------- Views: plain data for the Python pages ----------

function chrome() {
  const lv = store.levelInfo(S.xp);
  return { level: lv.level, rank: lv.rank, pct: lv.pct, streak: store.currentStreak(S), pounds: store.pounds(S) };
}

function punchSlots(day) {
  const slots = [];
  for (let i = 0; i < D.PUNCH_SLOTS; i++) {
    const h = day.punches[i];
    const chest = !!D.CHESTS.find((c) => c.at === i + 1);
    slots.push({ n: i + 1, on: h !== undefined, chest, text: h !== undefined ? hourLabel(h) : chest ? '' : String(i + 1) });
  }
  return slots;
}

function home() {
  const day = store.getDay(S);
  const len = S.settings.length;
  const lure = S.armedLure && store.lureCount(S, S.armedLure) > 0 ? D.LURES.find((l) => l.id === S.armedLure) : null;
  const r = seeded('sight:' + store.dayKey());
  const uncaught = D.MONSTERS.filter((m) => !S.caught[m.id] && m.rarity !== 'legendary');
  const picks = [];
  while (picks.length < 3 && uncaught.length) picks.push(uncaught.splice(Math.floor(r() * uncaught.length), 1)[0]);
  return {
    lengths: D.SESSION_LENGTHS.map((l) => ({ id: l.id, name: l.name, sub: `${l.fights} fight${l.fights > 1 ? 's' : ''} · ${l.hint}`, on: len === l.id })),
    positions: Object.values(D.POSITIONS).map((p) => {
      const prog = store.habitatProgress(S, p.habitat);
      return { id: p.id, label: p.label, icon: { bed: 'bed', sitting: 'desk', standing: 'stand' }[p.id], sub: `${D.HABITATS[p.habitat].name} · ${prog.got}/${prog.total} caught` };
    }),
    micOn: !!(S.settings.mic && detector.supported),
    lure: lure ? lure.name : '',
    punches: punchSlots(day),
    punchCount: day.punches.length,
    punchTotal: D.PUNCH_SLOTS,
    quests: day.quests.map((q) => {
      const info = store.questInfo(day, q);
      return { text: info.text, reward: info.reward, value: info.value, target: info.target, pct: info.value / info.target, claimed: !!q.claimed };
    }),
    sightings: picks.map((m) => ({ id: m.id, habitat: D.HABITATS[m.habitat].name })),
  };
}

function cardOf(m, extra) {
  const c = S.caught[m.id] || 0;
  const t = c ? D.tierFor(c) : null;
  return Object.assign({
    id: m.id, rarity: m.rarity, locked: !c, mystery: !c && m.rarity === 'legendary',
    name: c ? m.name : '???', rar: c ? `${rarityName(m.rarity)} · ×${c}` : rarityName(m.rarity), tier: t ? t.id : '',
  }, extra || {});
}

function collection(tab) {
  if (!D.HABITATS[tab]) tab = 'bedroom';
  const unique = store.uniqueCaught(S);
  const h = D.HABITATS[tab];
  return {
    tab, unique, total: D.MONSTERS.length, pct: unique / D.MONSTERS.length,
    tabs: Object.values(D.HABITATS).map((x) => { const p = store.habitatProgress(S, x.id); return { id: x.id, name: x.name, count: `${p.got}/${p.total}`, on: x.id === tab }; }),
    blurb: `${h.blurb} ${h.where}`,
    cards: D.MONSTERS.filter((m) => m.habitat === tab).map((m) => cardOf(m)),
  };
}

function monster(id) {
  const m = D.MONSTER_BY_ID[id];
  if (!m) return null;
  const c = S.caught[m.id] || 0;
  const habitat = D.HABITATS[m.habitat].name;
  if (!c) {
    return { id, rarity: m.rarity, rar: rarityName(m.rarity), habitat, locked: true, mystery: m.rarity === 'legendary', name: '???', flavor: '', tier: '', tierName: '',
      meta: `Not captured yet. ${m.rarity === 'legendary' ? 'Legends rarely show themselves. A Legendary Lure might help.' : 'Keep fighting in this habitat.'}` };
  }
  const t = D.tierFor(c);
  const next = [...D.CARD_TIERS].reverse().find((x) => x.min > c);
  return { id, rarity: m.rarity, rar: rarityName(m.rarity), habitat, locked: false, mystery: false, name: m.name, flavor: m.flavor, tier: t.id, tierName: t.name || '',
    meta: `Captured ×${c}${S.firstCaught[m.id] ? ` · first on ${S.firstCaught[m.id]}` : ''}${next ? ` · ${next.min - c} more for ${next.name}` : ' · Max tier!'}` };
}

function shop() {
  const have = store.pounds(S);
  return {
    pounds: have,
    lures: D.LURES.map((l) => {
      const owned = store.lureCount(S, l.id);
      return { id: l.id, name: l.name, desc: l.desc, rarity: l.rarity, price: l.price, owned, armed: S.armedLure === l.id && owned > 0, afford: have >= l.price };
    }),
    arenas: D.ARENAS.map((a) => {
      const owned = S.arenas.includes(a.id);
      const using = S.arena === a.id;
      return { id: a.id, name: a.name, on: using, owned, price: a.price, state: using ? 'Using' : owned ? 'Use' : `£${fmtNum(a.price)}` };
    }),
  };
}

function me() {
  const lv = store.levelInfo(S.xp);
  const t = S.totals;
  const st = S.settings;
  return {
    level: lv.level, rank: lv.rank, pct: lv.pct, xpText: `${fmtNum(lv.into)} / ${fmtNum(lv.need)} XP to level ${lv.level + 1}`,
    stats: [['Reps', fmtNum(t.reps)], ['By voice', fmtNum(t.micReps)], ['Time', fmtTime(t.seconds)],
      ['Sessions', fmtNum(t.sessions)], ['Captured', fmtNum(t.captures)], ['Best combo', `×${S.bestCombo}`]].map(([label, value]) => ({ label, value })),
    badges: D.BADGES.map((b) => ({ id: b.id, name: b.name, desc: b.desc, on: !!S.badges[b.id] })),
    badgeCount: Object.keys(S.badges).length, badgeTotal: D.BADGES.length,
    settings: { mic: !!st.mic, sound: !!st.sound, music: st.music !== false, vibrate: !!st.vibrate,
      sensitivity: 36 - st.sensitivity, sensLabel: sensLabel(st.sensitivity), minGap: st.minGap, gapLabel: `${(st.minGap / 1000).toFixed(2)}s` },
    reminders: Object.assign({}, st.reminders),
    scheduleText: scheduleText(),
    micSupported: detector.supported,
    version: APP_VERSION,
  };
}

function summary() {
  const s = lastSummary;
  if (!s) return null;
  const sum = s.summary;
  const day = store.getDay(S);
  const n = s.captured.length;
  return {
    pos: s.pos,
    title: n ? 'Victory!' : s.reps ? 'Good effort' : 'Session ended',
    win: n > 0,
    lead: n ? `${n} monster${n > 1 ? 's' : ''} captured. Your glutes thank you.` : 'Every rep counts. Come back in an hour for another punch.',
    stats: [['Reps', String(s.reps)], ['Time', fmtTime(sum.secs)], ['Best combo', `×${s.maxCombo}`],
      ['Earned', `£${fmtNum(sum.pounds)}`], ['XP', `+${sum.xp}`], ['By voice', String(s.micReps)]].map(([label, value]) => ({ label, value })),
    levelUp: sum.levelUp ? { level: sum.levelUp.level, rank: sum.levelUp.rank } : null,
    captured: s.captured.map((c) => {
      const m = D.MONSTER_BY_ID[c.id];
      return cardOf(m, { isNew: !!c.isNew, rar: `${rarityName(m.rarity)}${c.tierUp ? ` · ${c.tierUp}!` : ''}` });
    }),
    rewards: [
      ...sum.quests.map((q) => ({ icon: 'check', text: `Quest done: ${q.text}`, pounds: q.reward })),
      ...sum.chests.map((c) => ({ icon: 'gift', text: `${c.name} opened${c.lure ? ' + Epic Lure' : ''}`, pounds: c.pounds })),
      ...sum.badges.map((b) => ({ icon: 'medal', text: `Badge: ${b.name}. ${b.desc}`, pounds: 0 })),
    ],
    punches: punchSlots(day),
    punchCount: day.punches.length,
    punchTotal: D.PUNCH_SLOTS,
  };
}

// ---------- Actions from the Python pages: PF.act(name, value) -> {ok, msg?, kind?, ...} ----------

const ACTIONS = {
  length: (n) => { S.settings.length = Number(n); persist(); return { ok: true }; },
  mic: () => {
    if (!detector.supported) return { ok: false, msg: 'This browser can’t use the microphone. Tap to count reps instead.' };
    S.settings.mic = !S.settings.mic;
    persist();
    return { ok: true, on: S.settings.mic, tune: S.settings.mic && !S.settings.micSetupDone };
  },
  toggle: (key) => {
    if (!['sound', 'music', 'vibrate'].includes(key)) return { ok: false, msg: 'Unknown setting' };
    S.settings[key] = key === 'music' ? S.settings.music === false : !S.settings[key];
    applySettings();
    persist();
    return { ok: true };
  },
  sensitivity: (v) => { S.settings.sensitivity = 36 - Number(v); applySettings(); persist(); return { ok: true, label: sensLabel(S.settings.sensitivity) }; },
  minGap: (v) => { S.settings.minGap = Number(v); applySettings(); persist(); return { ok: true, label: `${(S.settings.minGap / 1000).toFixed(2)}s` }; },
  buyLure: (id) => {
    const l = D.LURES.find((x) => x.id === id);
    if (!l) return { ok: false, msg: 'Unknown lure' };
    if (!store.spend(S, l.price)) return { ok: false, msg: `You need £${fmtNum(l.price - store.pounds(S))} more. Go pound some reps!` };
    store.addLure(S, l.id);
    if (!S.armedLure) S.armedLure = l.id;
    persist();
    sfx.coin();
    return { ok: true, msg: `${l.name} bought${S.armedLure === l.id ? ' and armed' : ''}!` };
  },
  armLure: (id) => { S.armedLure = S.armedLure === id ? null : id; persist(); return { ok: true }; },
  arena: (id) => {
    const a = D.ARENAS.find((x) => x.id === id);
    if (!a) return { ok: false, msg: 'Unknown arena' };
    let msg = '';
    if (!S.arenas.includes(a.id)) {
      if (!store.spend(S, a.price)) return { ok: false, msg: `You need £${fmtNum(a.price - store.pounds(S))} more for ${a.name}.` };
      S.arenas.push(a.id);
      sfx.coin();
      msg = `${a.name} unlocked!`;
    }
    S.arena = a.id;
    persist();
    return { ok: true, msg };
  },
  reset: () => { S = store.resetAll(); applySettings(); return { ok: true }; },
  remPref: (kv) => {
    const p = S.settings.reminders;
    const [k, v] = String(kv).split('=');
    if (!['start', 'end', 'every'].includes(k)) return { ok: false };
    p[k] = Number(v);
    if (p.end <= p.start) p.end = Math.min(24, p.start + 1);
    persist();
    return { ok: true };
  },
  remWeekdays: () => { const p = S.settings.reminders; p.weekdays = !p.weekdays; persist(); return { ok: true }; },
  micSetupDone: () => { S.settings.micSetupDone = true; persist(); return { ok: true }; },
};

function act(name, value) {
  const fn = ACTIONS[name];
  if (!fn) return J({ ok: false, msg: 'Unknown action ' + name });
  return J(fn(value));
}

// ---------- Account sync (Python makes the server call; the merge rules live in store.js) ----------

// What to send: {switch: true} when this device holds someone else's progress (fetch theirs instead)
function syncOut(email) {
  if (S.owner && S.owner !== email) return J({ switch: true, data: null });
  S.owner = email;
  return J({ switch: false, data: S });
}

// The server's answer. mode 'switch': this account's copy replaces the device's (settings stay);
// returns {upload: true, data} when the account had nothing yet. mode 'merge': merge again (changes made meanwhile).
function syncIn(remoteText, email, mode) {
  const remote = remoteText ? JSON.parse(remoteText) : null;
  let next;
  if (mode === 'switch') {
    next = store.fromData(remote || {});
    next.settings = S.settings;
  } else {
    next = store.fromData(store.mergeStates(remote || {}, S));
  }
  next.owner = email;
  S = next;
  applySettings();
  saveLocal();
  return J({ upload: mode === 'switch' && !remote, data: mode === 'switch' && !remote ? S : null });
}

function signedOut() {
  S = store.resetAll(S.settings);
  applySettings();
  saveLocal();
}

const hasGuestProgress = () => !S.owner && (S.xp > 0 || store.uniqueCaught(S) > 0);

// ---------- Mic tuning (Dialogs/MicTest has the elements with these ids) ----------

function micErrorText(e) {
  if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
    return 'Microphone access was blocked. Allow it in your browser’s site settings, or turn Voice reps off and tap to count.';
  }
  return 'Could not start the microphone on this device. You can still tap to count reps.';
}

async function micTestOpen() {
  getAudioContext();
  micTest = { count: 0 };
  syncMusic();
  try {
    await detector.start();
    detector.listening = true;
    detector.recalibrate();
    S.settings.micSetupDone = true;
    persist();
    return 'Stay quiet for a second… then grunt, clap or say “HUP!”. Each time the bar jumps past the rep line, it counts.';
  } catch (e) {
    return micErrorText(e);
  }
}

function micTestClose() {
  micTest = null;
  if (!session) detector.stop();
  syncMusic();
}

function onTestRep() {
  micTest.count++;
  const el = $('tCount');
  if (el) {
    el.textContent = micTest.count;
    el.parentElement.classList.remove('pop');
    void el.parentElement.offsetWidth;
    el.parentElement.classList.add('pop');
  }
  sfx.hit(micTest.count);
}

function updateMeters(snap) {
  const set = (lvlId, thrId, baseId) => {
    const lvl = $(lvlId);
    if (!lvl) return;
    lvl.style.transform = `scaleX(${dbToMeter(snap.level)})`;
    lvl.classList.toggle('over', snap.level >= snap.threshold);
    const thr = $(thrId);
    if (thr) thr.style.left = `${dbToMeter(snap.threshold) * 100}%`;
    if (baseId) {
      const base = $(baseId);
      if (base) base.style.left = `${dbToMeter(snap.baseline) * 100}%`;
    }
  };
  set('mLvl', 'mThr');
  set('tLvl', 'tThr', 'tBase');
}

// ---------- Fight session (drawn into the Arena component's element) ----------

function rollRarity(min = 'common') {
  const allowed = D.RARITY_ORDER.slice(D.RARITY_ORDER.indexOf(min));
  const total = allowed.reduce((s, r) => s + D.RARITIES[r].weight, 0);
  let x = Math.random() * total;
  for (const r of allowed) {
    x -= D.RARITIES[r].weight;
    if (x <= 0) return r;
  }
  return allowed[allowed.length - 1];
}

function spawnMonster(habitat, minRarity) {
  const rarity = rollRarity(minRarity);
  const pool = D.MONSTERS.filter((m) => m.habitat === habitat && m.rarity === rarity);
  // Monsters you haven't caught yet show up more often
  const weighted = pool.flatMap((m) => (S.caught[m.id] ? [m] : [m, m, m]));
  return weighted[Math.floor(Math.random() * weighted.length)];
}

function pickExercises(pos, count) {
  const all = shuffle(D.EXERCISES[pos]);
  const reps = all.filter((e) => e.type === 'reps');
  const holds = all.filter((e) => e.type === 'hold');
  // Mostly rep exercises (that's where the voice counting shines), at most one hold
  const out = reps.slice(0, count);
  if (count >= 3 && holds.length) out.splice(1 + Math.floor(Math.random() * (count - 1)), 1, holds[0]);
  return out;
}

function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el || !host || !host.contains(el)) return;
  e.preventDefault();
  const a = el.dataset.action;
  if (a === 'skip-fight') escapeFight();
  else if (a === 'next-fight') nextFight();
  else if (a === 'end-session') endSession();
}
// Taps on the monster count as reps (pointerdown feels snappier than click)
function onPointer(e) {
  if (host && e.target.closest && e.target.closest('[data-tap]') && host.contains(e.target)) onRep('tap');
}
function onKey(e) {
  if (!session || !host || document.querySelector('.anvil-modal.in, .modal.in')) return;
  if (e.code === 'Space' || e.key === 'Enter') {
    if (e.target && e.target.closest && e.target.closest('button, a, input, select, textarea') && !e.target.closest('[data-tap]')) return;
    e.preventDefault();
    const f = cur();
    if (f.phase === 'fight') onRep('tap');
    else if (f.canAdvance) nextFight();
  }
}

// Start a session in el (called by Components/Arena when the Fight page shows).
async function fightStart(el, pos) {
  if (!D.POSITIONS[pos]) return false;
  fightStop();
  host = el;
  host.addEventListener('click', onClick);
  host.addEventListener('pointerdown', onPointer);
  document.addEventListener('keydown', onKey);
  getAudioContext(); // unlock audio inside the tap
  const p = D.POSITIONS[pos];
  let lure = null;
  if (S.armedLure && store.lureCount(S, S.armedLure) > 0) {
    lure = D.LURES.find((l) => l.id === S.armedLure);
    store.useLure(S, lure.id);
    if (!store.lureCount(S, lure.id)) S.armedLure = null;
  }
  const exercises = pickExercises(pos, S.settings.length);
  session = {
    pos,
    habitat: p.habitat,
    fights: exercises.map((ex, i) => {
      const monster = spawnMonster(p.habitat, i === 0 && lure ? lure.rarity : 'common');
      const bonus = D.RARITIES[monster.rarity].bonusReps;
      const maxHp = ex.type === 'reps' ? ex.target + bonus : ex.target + bonus * 2;
      return { ex, monster, maxHp, hp: maxHp, reps: 0, phase: 'ready', order: shuffle([...Array(36).keys()]) };
    }),
    index: 0,
    startedAt: Date.now(),
    startLevel: store.levelInfo(S.xp).level,
    startEarned: S.earned,
    startXp: S.xp,
    reps: 0,
    micReps: 0,
    captured: [],
    escaped: 0,
    combo: 0,
    maxCombo: 0,
    lastRepAt: 0,
    lastAnyRep: performance.now(),
    mic: S.settings.mic && detector.supported ? 'starting' : false,
    lure,
    hour: new Date().getHours(),
  };
  persist();
  route = 'fight';
  renderFight();
  keepAwake(true);
  session.ticker = setInterval(sessionTick, 250);
  if (session.mic) {
    try {
      await detector.start();
      if (session) session.mic = true;
    } catch (e) {
      if (session) session.mic = false;
      hook('toast', micErrorText(e), 'error');
    }
    updateMicBar();
    syncMusic();
  }
  if (session) beginRound();
  return true;
}

// Leave the fight screen. With keep=false (or no reps yet) the session is simply dropped.
function fightStop() {
  if (session) {
    const f = cur();
    if (f) {
      clearTimeout(f.readyTimer);
      clearInterval(f.autoTimer);
    }
    clearInterval(session.ticker);
    detector.listening = false;
    detector.stop();
    keepAwake(false);
    if (session.reps || session.captured.length) persist();
    session = null;
  }
  if (host) {
    host.removeEventListener('click', onClick);
    host.removeEventListener('pointerdown', onPointer);
    host.innerHTML = '';
  }
  document.removeEventListener('keydown', onKey);
  host = null;
}

const cur = () => session && session.fights[session.index];

function renderFight() {
  const f = cur();
  if (!host || !f) return;
  const { ex, monster } = f;
  const isHold = ex.type === 'hold';
  const tiles = Array.from({ length: 36 }, () => '<i></i>').join('');
  host.innerHTML = `<div class="fight arena-${esc(S.arena)}">
    <header class="fight-top">
      <div class="round">Fight ${session.index + 1}<span>/${session.fights.length}</span></div>
      <div class="ftimer" id="fTimer">${fmtTime((Date.now() - session.startedAt) / 1000)}</div>
      <button class="icon-btn" type="button" data-action="end-session" aria-label="End session">${I.x}</button>
    </header>
    <section class="ex">
      <div class="ex-type">${isHold ? `Hold ${f.maxHp} seconds` : `${f.maxHp} reps`}</div>
      <h1 class="ex-name">${esc(ex.name)}</h1>
      <p class="ex-desc">${esc(ex.desc)}</p>
    </section>
    <section class="stage r-${monster.rarity}" id="stage" ${isHold ? '' : 'data-tap="1" role="button" tabindex="0" aria-label="Tap to count a rep"'}>
      <div class="rarity-tag">${rarityName(monster.rarity)}${monster.rarity !== 'common' ? ' presence' : ''}</div>
      <div class="mframe" id="mframe">
        <div class="mart" id="mart">${monsterSVG(monster)}</div>
        <div class="fog" id="fog">${tiles}</div>
        <div class="pops" id="pops" aria-hidden="true"></div>
      </div>
      <div class="mname" id="mname">???</div>
      <div class="hp"><i id="hpFill"></i><span id="hpText">${f.hp} / ${f.maxHp}</span></div>
    </section>
    <section class="counter" aria-live="polite">
      <div class="count"><b id="repNow">${isHold ? f.hp : 0}</b><span>${isHold ? 'seconds left' : `/ ${f.maxHp} reps`}</span></div>
      <div class="combo" id="combo"></div>
    </section>
    <section class="micbar" id="micbar">
      <div class="meter"><div class="lvl" id="mLvl"></div><div class="thr" id="mThr"></div></div>
      <div class="miclabel" id="micLabel"></div>
    </section>
    <footer class="fight-foot">
      <span class="hint">${isHold ? 'Hold it! The monster melts while you hold.' : 'No mic? Tap the monster or press space for each rep.'}</span>
      <button class="link" type="button" data-action="skip-fight">${I.skip} Let it escape</button>
    </footer>
    <div class="overlay" id="overlay"></div>
  </div>`;
  updateMicBar();
}

function updateMicBar() {
  const bar = $('micbar');
  const label = $('micLabel');
  if (!bar || !session) return;
  const f = cur();
  bar.classList.toggle('off', session.mic !== true || f.ex.type === 'hold');
  if (f.ex.type === 'hold') {
    label.innerHTML = esc(f.ex.cue);
  } else if (session.mic === true) {
    label.innerHTML = `${I.mic} ${esc(f.ex.cue)}`;
  } else if (session.mic === 'starting') {
    label.innerHTML = `${I.mic} Starting mic…`;
  } else {
    label.innerHTML = `${I.micOff} Voice reps off: tap to count`;
  }
}

function beginRound() {
  const f = cur();
  f.phase = 'ready';
  detector.listening = false;
  const ov = $('overlay');
  let n = 3;
  const show = () => {
    if (!session || cur() !== f || !ov) return;
    ov.className = 'overlay show ready';
    ov.innerHTML = `<div class="ready-box">
      <div class="ready-sub">Fight ${session.index + 1} · ${f.ex.type === 'hold' ? `Hold ${f.maxHp} seconds` : `${f.maxHp} reps`}</div>
      <div class="ready-name">${esc(f.ex.name)}</div>
      <div class="ready-n">${n || 'GO!'}</div>
      <div class="ready-cue">${f.ex.type === 'reps' && session.mic === true ? esc(f.ex.cue) : ''}</div>
    </div>`;
  };
  show();
  sfx.tick();
  const step = () => {
    if (!session || cur() !== f) return;
    n--;
    show();
    if (n > 0) {
      sfx.tick();
      f.readyTimer = setTimeout(step, 900);
    } else {
      sfx.go();
      f.readyTimer = setTimeout(() => {
        if (!session || cur() !== f) return;
        ov.className = 'overlay';
        ov.innerHTML = '';
        f.phase = 'fight';
        f.startedAt = performance.now();
        session.lastAnyRep = performance.now();
        detector.listening = f.ex.type === 'reps';
        if (f.ex.type === 'hold') f.nextHoldTick = performance.now() + 1000;
      }, 500);
    }
  };
  f.readyTimer = setTimeout(step, 900);
}

function sessionTick() {
  if (!session) return;
  const t = $('fTimer');
  if (t) t.textContent = fmtTime((Date.now() - session.startedAt) / 1000);
  const f = cur();
  if (!f || f.phase !== 'fight') return;
  const now = performance.now();
  if (f.ex.type === 'hold') {
    while (f.phase === 'fight' && now >= f.nextHoldTick) {
      f.nextHoldTick += 1000;
      holdDamage(f);
    }
  } else if (session.mic === true) {
    const label = $('micLabel');
    const idle = now - session.lastAnyRep > 10000;
    if (label) label.classList.toggle('nudge', idle);
    if (label && idle && !label.dataset.idle) {
      label.dataset.idle = '1';
      label.innerHTML = `${I.mic} Not hearing you? Be louder, tap the monster, or raise sensitivity in Me.`;
    } else if (label && !idle && label.dataset.idle) {
      delete label.dataset.idle;
      updateMicBar();
    }
  }
}

function comboMult(c) {
  return Math.min(3, 1 + Math.floor(c / 5) * 0.5);
}

function onRep(source) {
  if (!session || route !== 'fight') return;
  const f = cur();
  if (!f || f.phase !== 'fight' || f.ex.type !== 'reps') return;
  const now = performance.now();
  session.combo = now - session.lastRepAt < 4000 ? session.combo + 1 : 1;
  session.lastRepAt = now;
  session.lastAnyRep = now;
  session.maxCombo = Math.max(session.maxCombo, session.combo);
  const mult = comboMult(session.combo);
  const gain = Math.round(2 * mult);

  // Commit progress straight away so nothing is lost if the tab closes
  const day = store.getDay(S);
  store.addPounds(S, gain);
  S.xp += 5;
  S.totals.reps++;
  day.reps++;
  if (source === 'mic') {
    S.totals.micReps++;
    day.micReps++;
    session.micReps++;
  }
  day.maxCombo = Math.max(day.maxCombo, session.combo);
  S.bestCombo = Math.max(S.bestCombo, session.combo);
  session.reps++;
  f.reps++;
  f.hp--;

  sfx.hit(session.combo);
  showDamage(f, `+£${gain}`, source);
  const c = $('combo');
  if (c) {
    c.innerHTML = session.combo >= 3 ? `<b>COMBO ×${session.combo}</b>${mult > 1 ? `<span>£ ×${mult}</span>` : ''}` : '';
    c.classList.remove('bump');
    void c.offsetWidth;
    c.classList.add('bump');
  }
  if (source === 'mic') {
    const bar = $('micbar');
    if (bar) {
      bar.classList.remove('heard');
      void bar.offsetWidth;
      bar.classList.add('heard');
    }
  }
  if (session.reps % 10 === 0) persist();
  if (f.hp <= 0) capture(f);
}

function holdDamage(f) {
  store.addPounds(S, 1);
  S.xp += 3;
  f.hp--;
  sfx.hit(1);
  showDamage(f, '+£1', 'hold');
  if (f.hp <= 0) capture(f);
}

function showDamage(f, text, source) {
  const done = 1 - f.hp / f.maxHp;
  const fill = $('hpFill');
  if (fill) fill.style.transform = `scaleX(${Math.max(0, f.hp / f.maxHp)})`;
  const hpText = $('hpText');
  if (hpText) hpText.textContent = `${Math.max(0, f.hp)} / ${f.maxHp}`;
  const repNow = $('repNow');
  if (repNow) repNow.textContent = f.ex.type === 'hold' ? Math.max(0, f.hp) : f.reps;
  // Uncover fog tiles
  const fog = $('fog');
  if (fog) {
    const n = f.hp <= 0 ? 36 : Math.floor(36 * done);
    for (let i = 0; i < n; i++) fog.children[f.order[i]].classList.add('gone');
  }
  const art = $('mart');
  if (art) {
    art.classList.remove('hit');
    void art.offsetWidth;
    art.classList.add('hit');
  }
  const pops = $('pops');
  if (pops) {
    const p = document.createElement('div');
    p.className = `pop ${source}`;
    p.textContent = text;
    p.style.left = `${20 + Math.random() * 60}%`;
    p.style.top = `${25 + Math.random() * 35}%`;
    pops.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }
}

function capture(f) {
  f.phase = 'captured';
  detector.listening = false;
  const m = f.monster;
  const rar = D.RARITIES[m.rarity];
  const prev = S.caught[m.id] || 0;
  const isNew = prev === 0;
  S.caught[m.id] = prev + 1;
  if (isNew) S.firstCaught[m.id] = store.dayKey();
  const oldTier = D.tierFor(prev);
  const newTier = D.tierFor(prev + 1);
  const tierUp = !isNew && newTier && newTier.name && (!oldTier || oldTier.id !== newTier.id) ? newTier : null;
  const pounds = rar.pounds + (isNew ? 20 : 0) + (tierUp ? 25 : 0);
  const xp = rar.xp + (isNew ? 30 : 0);
  store.addPounds(S, pounds);
  S.xp += xp;
  S.totals.captures++;
  const day = store.getDay(S);
  day.captures++;
  day.habitat[m.habitat] = (day.habitat[m.habitat] || 0) + 1;
  if (m.rarity !== 'common') day.rareCaptures++;
  // Punch the card for this hour
  const hour = new Date().getHours();
  let punched = false;
  if (!day.punches.includes(hour) && day.punches.length < D.PUNCH_SLOTS) {
    day.punches.push(hour);
    punched = true;
  }
  store.touchStreak(S);
  session.captured.push({ id: m.id, isNew, tierUp: tierUp && tierUp.name, pounds, xp });
  persist();

  sfx.capture(m.rarity);
  showDamage(f, 'CAPTURED', 'cap');
  const mname = $('mname');
  if (mname) mname.textContent = m.name;
  const stage = $('stage');
  if (stage) stage.classList.add('won');
  const last = session.index >= session.fights.length - 1;
  const ov = $('overlay');
  setTimeout(() => {
    if (!session || cur() !== f || !ov) return;
    ov.className = `overlay show cap r-${m.rarity}`;
    ov.innerHTML = `<div class="cap-box">
      ${sparkles(m.rarity === 'common' ? 8 : 16)}
      <div class="cap-title">${isNew ? 'NEW MONSTER!' : 'CAPTURED!'}</div>
      <div class="cap-card r-${m.rarity} t-${newTier.id}">
        <div class="cap-art">${monsterSVG(m)}</div>
        <div class="cap-name">${esc(m.name)}</div>
        <div class="cap-rar"><span class="rar r-${m.rarity}">${rarityName(m.rarity)}</span> · ${D.HABITATS[m.habitat].name}</div>
        <p class="flavor">“${esc(m.flavor)}”</p>
      </div>
      <div class="cap-meta">${isNew ? 'Added to your collection' : `Caught ×${prev + 1}`}${tierUp ? ` · <b>${tierUp.name} card!</b>` : ''}${punched ? ` · ${I.check} Punch card stamped` : ''}</div>
      <div class="cap-rewards">${coin(pounds)} <span>+${xp} XP</span></div>
      <button class="btn primary big" type="button" data-action="next-fight">${last ? 'See results' : 'Next fight'} <span class="auto" id="autoN"></span></button>
    </div>`;
    f.canAdvance = true;
    autoAdvance(f, 7);
  }, 700);
}

// Little gold stars that twinkle around the capture card
function sparkles(n) {
  return Array.from({ length: n }, () => {
    const size = 8 + Math.random() * 14;
    return `<i class="spark" style="left:${Math.random() * 100}%;top:${Math.random() * 90}%;width:${size}px;height:${size}px;animation-delay:${(Math.random() * 1.6).toFixed(2)}s"></i>`;
  }).join('');
}

function autoAdvance(f, secs) {
  let n = secs;
  const el = () => $('autoN');
  if (el()) el().textContent = n;
  f.autoTimer = setInterval(() => {
    if (!session || cur() !== f) return clearInterval(f.autoTimer);
    n--;
    if (el()) el().textContent = n;
    if (n <= 0) {
      clearInterval(f.autoTimer);
      nextFight();
    }
  }, 1000);
}

function escapeFight() {
  const f = cur();
  if (!f || f.phase === 'captured' || f.phase === 'escaped') return;
  clearTimeout(f.readyTimer);
  f.phase = 'escaped';
  detector.listening = false;
  session.escaped++;
  S.totals.escapes++;
  persist();
  sfx.escape();
  const stage = $('stage');
  if (stage) stage.classList.add('fled');
  const last = session.index >= session.fights.length - 1;
  const ov = $('overlay');
  f.canAdvance = true;
  ov.className = 'overlay show escaped';
  ov.innerHTML = `<div class="ready-box">
    <div class="ready-name">It got away…</div>
    <p class="muted">${f.reps ? `You landed ${f.reps} rep${f.reps > 1 ? 's' : ''}. Those still count.` : 'No harm done. Plenty more where that came from.'}</p>
    <button class="btn primary big" type="button" data-action="next-fight">${last ? 'See results' : 'Next fight'} <span class="auto" id="autoN"></span></button>
  </div>`;
  autoAdvance(f, 4);
}

function nextFight() {
  if (!session) return;
  const f = cur();
  clearInterval(f.autoTimer);
  if (session.index >= session.fights.length - 1) return finishSession();
  session.index++;
  session.combo = 0;
  renderFight();
  beginRound();
}

// The X button: nothing done yet -> straight home; otherwise ask (a Python confirm dialog)
async function endSession() {
  if (!session) return;
  if (!session.reps && !session.captured.length) {
    fightStop();
    hook('quit');
    return;
  }
  const yes = await Promise.resolve(hook('confirmEnd'));
  if (!yes || !session) return;
  const f = cur();
  if (f && f.phase !== 'captured' && f.phase !== 'escaped') {
    session.escaped++;
    S.totals.escapes++;
  }
  finishSession();
}

function finishSession() {
  if (!session) return;
  const f = cur();
  if (f) {
    clearTimeout(f.readyTimer);
    clearInterval(f.autoTimer);
  }
  clearInterval(session.ticker);
  detector.listening = false;
  detector.stop();
  keepAwake(false);

  const secs = Math.round((Date.now() - session.startedAt) / 1000);
  const day = store.getDay(S);
  const didSomething = session.reps > 0 || session.captured.length > 0;
  if (didSomething) {
    S.totals.sessions++;
    day.sessions++;
    S.totals.seconds += secs;
    S.lastSessionAt = Date.now();
    store.touchStreak(S);
  }

  // Quests
  const quests = [];
  for (const q of day.quests) {
    const info = store.questInfo(day, q);
    if (info.done && !q.claimed) {
      q.claimed = true;
      store.addPounds(S, info.reward);
      S.xp += 50;
      quests.push(info);
    }
  }
  // Punch-card chests
  const chests = [];
  for (const c of D.CHESTS) {
    if (day.punches.length >= c.at && !day.chests[c.at]) {
      day.chests[c.at] = true;
      store.addPounds(S, c.pounds);
      S.xp += c.xp;
      if (c.lure) store.addLure(S, c.lure);
      chests.push(c);
    }
  }
  const badges = store.checkBadges(S, { hour: session.hour });
  persist();

  const lvAfter = store.levelInfo(S.xp);
  session.summary = {
    secs,
    quests,
    chests,
    badges,
    levelUp: lvAfter.level > session.startLevel ? lvAfter : null,
    pounds: S.earned - session.startEarned,
    xp: S.xp - session.startXp,
  };
  const done = session;
  session = null;
  lastSummary = done;
  if (done.summary.levelUp) setTimeout(() => sfx.levelUp(), 300);
  else if (done.summary.pounds > 0) setTimeout(() => sfx.coin(), 300);
  hook('finished', didSomething);
}

// ---------- Reminders: push subscription + the in-app fallback (Python owns the dialogs and server calls) ----------

const ua = navigator.userAgent;
const env = {
  ios: /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  standalone: (() => {
    try { return window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone; } catch (e) { return false; }
  })(),
  notifications: 'Notification' in window,
  push: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext,
};
// The service worker keeps its old address and scope (_/theme/app/), so existing push subscriptions keep working.
const SW_URL = '_/theme/app/sw.js';
const SW_SCOPE = '_/theme/app/';

function b64ToBytes(b64) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
const bytesToB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function scheduleText() {
  const p = S.settings.reminders;
  return `${p.weekdays ? 'Weekdays' : 'Every day'}, ${hourText(p.start)}–${hourText(p.end)}, every ${p.every} min.`;
}

const push = {
  env: () => J(Object.assign({}, env, { installable: !!window.pfInstallPrompt })),
  prefs: () => J(Object.assign({ on: true }, S.settings.reminders)),
  async permission() {
    if (!env.notifications) return 'unsupported';
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    return perm;
  },
  // Subscribe with the server's VAPID key; '' when push isn't possible (the app falls back to local reminders)
  async subscribe(key) {
    try {
      await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
      const reg = await navigator.serviceWorker.ready.then(() => navigator.serviceWorker.getRegistration(SW_SCOPE));
      let sub = await reg.pushManager.getSubscription();
      const current = sub && sub.options && sub.options.applicationServerKey;
      if (sub && current && bytesToB64(current) !== key) {
        await sub.unsubscribe();
        sub = null;
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
      return JSON.stringify(sub.toJSON());
    } catch (e) {
      console.warn('Push setup failed, using local reminders', e);
      return '';
    }
  },
  async unsubscribe() {
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
      const sub = reg && (await reg.pushManager.getSubscription());
      if (sub) await sub.unsubscribe();
    } catch (e) { /* already gone */ }
    return true;
  },
  async check() {
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
      return !!(reg && (await reg.pushManager.getSubscription()));
    } catch (e) {
      return false;
    }
  },
};

let lastLocal = 0;
setInterval(() => {
  if (store.deviceGet().reminders !== 'local' || session || !env.notifications || Notification.permission !== 'granted') return;
  const p = S.settings.reminders;
  const now = new Date();
  if (p.weekdays && (now.getDay() === 0 || now.getDay() === 6)) return;
  if (now.getHours() < p.start || now.getHours() >= p.end) return;
  if (Date.now() - Math.max(S.lastSessionAt || 0, lastLocal) < p.every * 60000) return;
  lastLocal = Date.now();
  const title = 'A wild monster appeared!';
  const options = { body: 'One quick fight. Brain off, glutes on.', tag: 'pf-reminder', icon: '_/theme/app/icon-192.png' };
  (navigator.serviceWorker ? navigator.serviceWorker.getRegistration(SW_SCOPE) : Promise.resolve(null))
    .then((reg) => (reg ? reg.showNotification(title, options) : new Notification(title, options)))
    .catch(() => { try { new Notification(title, options); } catch (e) { /* not allowed */ } });
}, 60000);

// ---------- The API Python uses ----------

window.PF = {
  hooks,
  version: APP_VERSION,
  setRoute: (r) => { route = r; syncMusic(); },
  chrome: () => J(chrome()),
  home: () => J(home()),
  collection: (tab) => J(collection(tab)),
  monster: (id) => J(monster(id)),
  shop: () => J(shop()),
  me: () => J(me()),
  summary: () => J(summary()),
  art: (id) => (D.MONSTER_BY_ID[id] ? monsterSVG(D.MONSTER_BY_ID[id]) : ''),
  act,
  // Call inside a tap (iPhone only lets sound start from a user gesture)
  unlock: () => { try { getAudioContext(); } catch (e) { /* no audio */ } return true; },
  micSupported: () => detector.supported,
  hasGuestProgress,
  syncOut,
  syncIn,
  signedOut,
  device: () => J(store.deviceGet()),
  deviceSet: (text) => J(store.deviceSet(JSON.parse(text || '{}'))),
  scheduleText,
  push,
  micTestOpen,
  micTestClose,
  recalibrate: () => detector.recalibrate(),
  // Not awaited: the mic may take a while to answer (or ask for permission); the countdown starts once it has
  fightStart: (el, pos) => { if (!D.POSITIONS[pos]) return false; fightStart(el, pos); return true; },
  fightStop,
  inFight: () => !!session,
  // Handy for testing in the console and in tools/ui/smoke.js
  debug: { get state() { return S; }, detector, onRep, finish: () => finishSession() },
};
if (window.__pfReady) window.__pfReady(window.PF);
