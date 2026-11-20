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

// Meeting mode keeps the app silent (no sounds, vibration or music) during a silent session and for half an hour
// after it, so tapping Home after a meeting fight doesn't start the music. A normal fight, or switching sound or
// music in Me, ends the hush. Kept on this device only.
const HUSH_MS = 30 * 60000;
let hushUntil = Number(store.deviceGet().hushUntil) || 0;
const hushed = () => !!(session && session.silent) || Date.now() < hushUntil;
function setHush(on) {
  hushUntil = on ? Date.now() + HUSH_MS : 0;
  store.deviceSet({ hushUntil });
}

function applySettings() {
  detector.sensitivity = S.settings.sensitivity;
  detector.minGap = S.settings.minGap;
  configureSfx({
    sound: S.settings.sound && !hushed(),
    vibrate: S.settings.vibrate && !hushed(),
    onPlaySound: (ms) => detector.suppress(ms), // don't let our own sounds count as reps
  });
  syncMusic();
}

// ---------- Music: real tracks streamed by ArkMusic (ark-music.js, from APP_MAKER/media) ----------
// Never while the mic counts reps or is being tuned: it would hear the music and count it as reps.
// Never in meeting mode either (a silent session, its results, and the hush after it).
const MUSIC = { menu: ['cosmic', 'dont-stress-out'], fight: ['how-do-you-love'], summary: ['nailed-it', 'cosmic'] };
function syncMusic() {
  const M = window.ArkMusic;
  if (!M) return;
  M.enabled(S.settings.music !== false);
  if (micTest || route === 'admin' || hushed()) return M.stop(0.3);
  if (route === 'fight') return session && session.mic ? M.stop(0.3) : M.play(MUSIC.fight, { volume: 0.5 });
  if (route === 'summary') return lastSummary && lastSummary.silent ? M.stop(0.3) : M.play(MUSIC.summary, { volume: 0.45 });
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
  const st = store.streakState(S);
  // risk: a live streak that still needs today's fight (a workday you haven't fought yet)
  const risk = st.alive && !st.today && !st.rest;
  return { level: lv.level, rank: lv.rank, pct: lv.pct, streak: st.count, risk, pounds: store.pounds(S),
    streakTitle: !st.count ? 'Day streak' : st.today ? `${st.count}-day streak: safe for today` : risk ? `${st.count}-day streak: fight today to keep it` : `${st.count}-day streak: safe (rest day)` };
}

// ---------- Streak strip (Home) and the 3-week calendar (Me) ----------

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayName = (key) => DAY_NAMES[store.parseDay(key).getDay()];
const joinAnd = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
const fought = (key) => store.foughtDay(S.days[key]) || key === S.streak.last;
const mondayOf = (d) => store.addDays(d, -((d.getDay() + 6) % 7));

function streakView(now = new Date()) {
  const st = store.streakState(S, now);
  const today = store.dayKey(now);
  const tomorrowRest = store.isRestDay(S, store.addDays(now, 1));
  const n = st.count;
  let title, sub;
  if (st.alive) {
    title = `${n}-day streak`;
    if (st.today) sub = tomorrowRest ? `Safe for today. Weekend next: back Monday for ${n + 1}.` : `Safe for today. Come back tomorrow for ${n + 1}.`;
    else if (st.rest) sub = `Weekend: your streak is safe. A fight still makes it ${n + 1}.`;
    else if (st.needed.length) sub = `Fight today to make it ${n + 1}. ${st.needed.length > 1 ? `${st.needed.length} Streak Shields cover` : 'A Streak Shield covers'} ${joinAnd(st.needed.map(dayName))}.`;
    else sub = `Fight today to make it ${n + 1}.`;
  } else if (st.lost >= 2 && st.repair > 0) {
    title = 'Streak on the line';
    sub = `Your ${st.lost}-day streak can still be saved: ${plural(st.repair, 'more Streak Shield')} from the Shop covers ${joinAnd(st.needed.map(dayName))}.`;
  } else if (st.lost >= 2) {
    title = 'New streak today';
    sub = `Your last streak reached ${st.lost} days. One fight starts the next one.`;
  } else {
    title = 'Start a streak';
    sub = store.weekendsOff(S) ? 'Fight once a workday. Weekends never break it.' : 'Fight once a day to build a streak.';
  }
  const monday = mondayOf(now);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = store.addDays(monday, i);
    const k = store.dayKey(d);
    const on = fought(k);
    const shield = !!S.shieldDays[k];
    const rest = store.isRestDay(S, d);
    const future = k > today;
    return { key: k, label: 'MTWTFSS'[i], on, shield, rest, today: k === today, future,
      title: `${DAY_NAMES[d.getDay()]}: ${on ? 'fought' : shield ? 'covered by a Streak Shield' : future ? 'still to come' : k === today ? 'not yet' : rest ? 'rest day' : 'no fight'}` };
  });
  return { count: n, alive: st.alive, today: st.today, rest: st.rest, shields: st.shields, maxShields: D.STREAK.maxHeld,
    needed: st.needed.length, repair: st.repair, title, sub, week };
}

function calendarView(now = new Date()) {
  const today = store.dayKey(now);
  const start = store.addDays(mondayOf(now), -14);
  return Array.from({ length: 21 }, (_, i) => {
    const d = store.addDays(start, i);
    const k = store.dayKey(d);
    const rec = S.days[k];
    const on = fought(k);
    const punches = rec ? (rec.punches || []).length : 0;
    const lv = !on ? 0 : punches >= 6 ? 4 : punches >= 4 ? 3 : punches >= 2 ? 2 : 1;
    const shield = !!S.shieldDays[k];
    const future = k > today;
    const label = `${DAY_NAMES[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    const what = on ? (punches ? plural(punches, 'punch', 'punches') : 'fought') : shield ? 'covered by a Streak Shield' : future ? 'still to come'
      : store.isRestDay(S, d) ? 'rest day' : k === today ? 'no fight yet' : 'no fight';
    return { key: k, day: d.getDate(), lv, on, shield, rest: store.isRestDay(S, d), today: k === today, future, title: `${label}: ${what}` };
  });
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
      return { id: p.id, label: p.label, icon: { bed: 'bed', sitting: 'desk', standing: 'stand', meeting: 'eyeoff' }[p.id], silent: !!p.silent,
        go: p.silent ? 'SHH' : 'FIGHT',
        sub: p.silent ? `${D.HABITATS[p.habitat].name} · silent, nobody notices` : `${D.HABITATS[p.habitat].name} · ${prog.got}/${prog.total} caught` };
    }),
    streak: streakView(),
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
    shield: (() => {
      const held = store.shieldsHeld(S);
      const st = store.streakState(S);
      const full = held >= D.STREAK.maxHeld;
      return { price: D.STREAK.price, held, max: D.STREAK.maxHeld, full, afford: have >= D.STREAK.price && !full,
        owned: held ? `You hold ${held} of ${D.STREAK.maxHeld}` : '',
        note: st.repair ? `Your ${st.lost}-day streak can be saved with ${plural(st.repair, 'more shield')}.` : full ? 'You carry the most you can.' : '' };
    })(),
  };
}

function me() {
  const lv = store.levelInfo(S.xp);
  const t = S.totals;
  const st = S.settings;
  const cal = calendarView();
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
    weekendsOff: store.weekendsOff(S),
    calendar: cal,
    streak: streakView(),
    bestStreak: Math.max(t.bestStreak || 0, S.streak.count || 0),
    foughtDays: cal.filter((c) => c.on).length,
  };
}

function summary() {
  const s = lastSummary;
  if (!s) return null;
  const sum = s.summary;
  const day = store.getDay(S);
  const n = s.captured.length;
  const caught = `${n} monster${n > 1 ? 's' : ''} captured.`;
  // The streak news from this session's first fight of the day (touchStreak's result)
  const sr = sum.streak;
  const streakRows = [];
  if (sr) {
    if (sr.shieldsUsed.length) {
      streakRows.push({ icon: 'shield', text: `${sr.shieldsUsed.length > 1 ? `${sr.shieldsUsed.length} Streak Shields used` : 'Streak Shield used'}: ${joinAnd(sr.shieldsUsed.map(dayName))} covered`, pounds: 0 });
    }
    streakRows.push({ icon: 'flame', pounds: 0,
      text: sr.broken && sr.was >= 2 ? `Day 1 of a new streak (the last one reached ${sr.was} days)` : sr.count === 1 ? 'Day 1 of your streak. Fight next workday for 2.' : `${sr.count}-day streak!` });
    if (sr.shieldEarned) streakRows.push({ icon: 'shield', text: `+1 Streak Shield (every ${D.STREAK.shieldEvery}th streak day)`, pounds: 0 });
  }
  // The catch worth sharing: a new monster first, then the rarest, then the latest
  const rank = (c) => (c.isNew ? 10 : 0) + D.RARITY_ORDER.indexOf(D.MONSTER_BY_ID[c.id].rarity);
  const best = s.captured.reduce((b, c) => (!b || rank(c) >= rank(b) ? c : b), null);
  return {
    pos: s.pos,
    silent: !!s.silent,
    share: best ? best.id : '',
    title: n ? (s.silent ? 'Silent victory' : 'Victory!') : s.reps ? 'Good effort' : 'Session ended',
    win: n > 0,
    lead: s.silent ? (n ? `Nobody noticed. ${caught}` : 'Nobody noticed. Every rep still counts.')
      : n ? `${caught} Your glutes thank you.` : 'Every rep counts. Come back in an hour for another punch.',
    stats: [['Reps', String(s.reps)], ['Time', fmtTime(sum.secs)], ['Best combo', `×${s.maxCombo}`],
      ['Earned', `£${fmtNum(sum.pounds)}`], ['XP', `+${sum.xp}`], ['By voice', String(s.micReps)]].map(([label, value]) => ({ label, value })),
    levelUp: sum.levelUp ? { level: sum.levelUp.level, rank: sum.levelUp.rank } : null,
    captured: s.captured.map((c) => {
      const m = D.MONSTER_BY_ID[c.id];
      return cardOf(m, { isNew: !!c.isNew, rar: `${rarityName(m.rarity)}${c.tierUp ? ` · ${c.tierUp}!` : ''}` });
    }),
    rewards: [
      ...streakRows,
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
    if (hushUntil) setHush(false); // touching a sound switch ends the quiet time after a meeting
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
  // Streak Shields are bought with pounds (the game's own coins), never real money
  buyShield: () => {
    const held = store.shieldsHeld(S);
    if (held >= D.STREAK.maxHeld) return { ok: false, msg: `You already hold ${D.STREAK.maxHeld} Streak Shields, the most you can carry.` };
    const before = store.streakState(S);
    if (!store.spend(S, D.STREAK.price)) return { ok: false, msg: `You need £${fmtNum(D.STREAK.price - store.pounds(S))} more for a Streak Shield. Go pound some reps!` };
    S.totals.shieldsBought = (S.totals.shieldsBought || 0) + 1;
    persist();
    sfx.coin();
    const after = store.streakState(S);
    if (!before.alive && after.alive) return { ok: true, msg: `Streak saved! Fight today to keep your ${after.count}-day streak.` };
    return { ok: true, msg: `Streak Shield bought. You hold ${after.shields}.` };
  },
  weekendsOff: () => {
    const before = store.currentStreak(S);
    S.settings.weekendsOff = S.settings.weekendsOff === false;
    persist();
    const after = store.currentStreak(S);
    if (after < before) return { ok: true, on: S.settings.weekendsOff, msg: `Weekends now count, so your ${before}-day streak has a gap. Switch back to keep it.` };
    return { ok: true, on: S.settings.weekendsOff };
  },
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

let forceExercise = null; // tests: PF.debug.forceExercise('meet-desk-press') picks that move first, once

function pickExercises(pos, count) {
  const all = shuffle(D.EXERCISES[pos]);
  let forced = null;
  if (forceExercise) {
    const i = all.findIndex((e) => e.id === forceExercise);
    if (i >= 0) forced = all.splice(i, 1)[0];
    forceExercise = null;
  }
  if (forced) all.unshift(forced);
  // Meeting mode: any mix (mostly holds, which melt the monster with no input at all)
  if (D.POSITIONS[pos].silent) return all.slice(0, count);
  const reps = all.filter((e) => e.type === 'reps');
  const holds = all.filter((e) => e.type === 'hold');
  // Mostly rep exercises (that's where the voice counting shines), at most one hold
  const out = reps.slice(0, count);
  if (forced && forced.type === 'hold') out[0] = forced;
  else if (count >= 3 && holds.length) out.splice(1 + Math.floor(Math.random() * (count - 1)), 1, holds[0]);
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
  else if (a === 'disguise') setDisguise(true);
  else if (a === 'reveal') setDisguise(false);
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
  const p = D.POSITIONS[pos];
  if (!p.silent) getAudioContext(); // unlock audio inside the tap (meeting mode stays silent)
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
    // Meeting mode: the mic never starts (no permission prompt), no sound, vibration or music
    mic: !p.silent && S.settings.mic && detector.supported ? 'starting' : false,
    silent: !!p.silent,
    disguised: false,
    streak: null, // touchStreak's news from the first fight of the day (the Summary shows it)
    lure,
    hour: new Date().getHours(),
  };
  if (p.silent) setHush(true);
  else if (hushUntil) setHush(false); // a normal fight ends the quiet time after a meeting
  applySettings();
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
    if (session.silent) setHush(true);
    session = null;
    applySettings();
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
  const silent = session.silent;
  host.innerHTML = `<div class="fight arena-${esc(S.arena)}${silent ? ' stealth' : ''}${session.disguised ? ' disguised' : ''}">
    <header class="fight-top">
      <div class="round">Fight ${session.index + 1}<span>/${session.fights.length}</span></div>
      <div class="ftimer" id="fTimer">${fmtTime((Date.now() - session.startedAt) / 1000)}</div>
      ${silent ? `<button class="disguise-btn" type="button" data-action="disguise">${I.table} Disguise</button>` : ''}
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
      <span class="hint">${silent ? (isHold ? 'Just hold. The monster melts on its own, no taps needed.' : 'Tap the monster once per rep. Silent, no mic.')
        : isHold ? 'Hold it! The monster melts while you hold.' : 'No mic? Tap the monster or press space for each rep.'}</span>
      <button class="link" type="button" data-action="skip-fight">${I.skip} Let it escape</button>
    </footer>
    <div class="overlay" id="overlay"></div>
    ${silent ? disguiseMarkup() : ''}
  </div>`;
  updateMicBar();
  updateDisguise();
}

// ---------- Meeting mode's disguise: a dull spreadsheet over the fight ----------
// Holds keep melting the monster underneath, a tap on the grid counts a rep, and the status bar tells the player
// (and only the player) how it is going: Count = reps landed, Sum = seconds or reps left, Recalculating = progress.
function disguiseMarkup() {
  const r = seeded('sheet:' + session.startedAt);
  const cols = ['A', 'B', 'C', 'D', 'E', 'F'];
  const heads = ['Region', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'];
  const regions = ['North', 'South', 'East', 'West', 'Central', 'Online', 'Retail', 'Partners', 'EMEA', 'APAC', 'Other', 'Total'];
  const money = () => (1200 + Math.floor(r() * 88000)).toLocaleString('en-US');
  const rows = regions.map((name, i) => `<tr><th>${i + 2}</th><td>${name}</td>${[1, 2, 3, 4, 5].map(() => `<td>${money()}</td>`).join('')}</tr>`).join('');
  const tabs = session.fights.map((_, i) => `<span class="ds-tab" data-sheet="${i}">Sheet${i + 1}</span>`).join('');
  return `<div class="disguise" id="disguise" aria-label="Disguise: a spreadsheet. Tap the grid to count a rep.">
    <div class="ds-bar"><b>Q3_numbers.xlsx</b><span class="ds-menu">File  Home  Insert  Formulas  Data  Review</span>
      <button class="ds-reveal" type="button" data-action="reveal">Show monster</button></div>
    <div class="ds-formula"><span class="ds-cell">E7</span><span class="ds-fx">fx</span><span>=SUM(B7:D7)*1.04</span></div>
    <div class="ds-grid" data-tap="1">
      <table><thead><tr><th></th>${cols.map((c) => `<th>${c}</th>`).join('')}</tr><tr><th>1</th>${heads.map((h) => `<td><b>${h}</b></td>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table>
    </div>
    <div class="ds-tabs">${tabs}</div>
    <div class="ds-status"><span id="dsCalc">Ready</span><span class="ds-prog"><i id="dsProg"></i></span><span id="dsCount">Count: 0</span><span id="dsSum">Sum: 0</span></div>
  </div>`;
}

function updateDisguise() {
  const box = $('disguise');
  if (!box || !session) return;
  const f = cur();
  if (!f) return;
  const done = 1 - Math.max(0, f.hp) / f.maxHp;
  const calc = $('dsCalc');
  if (calc) calc.textContent = f.phase === 'captured' ? 'Saved' : f.phase === 'fight' ? `Recalculating… ${Math.round(done * 100)}%` : 'Ready';
  const prog = $('dsProg');
  if (prog) prog.style.transform = `scaleX(${done.toFixed(3)})`;
  const count = $('dsCount');
  if (count) count.textContent = `Count: ${f.ex.type === 'hold' ? f.maxHp - Math.max(0, f.hp) : f.reps}`;
  const sum = $('dsSum');
  if (sum) sum.textContent = `Sum: ${Math.max(0, f.hp)}`;
  box.querySelectorAll('.ds-tab').forEach((t) => t.classList.toggle('on', Number(t.dataset.sheet) === session.index));
}

function setDisguise(on) {
  if (!session || !session.silent) return;
  session.disguised = !!on;
  const fight = host && host.querySelector('.fight');
  if (fight) fight.classList.toggle('disguised', session.disguised);
  updateDisguise();
  const focus = host && host.querySelector(on ? '.ds-reveal' : '.disguise-btn');
  if (focus) focus.focus({ preventScroll: true });
}

function updateMicBar() {
  const bar = $('micbar');
  const label = $('micLabel');
  if (!bar || !session) return;
  const f = cur();
  bar.classList.toggle('off', session.mic !== true || f.ex.type === 'hold');
  if (session.silent) {
    label.innerHTML = `${I.eyeOff} ${esc(f.ex.cue)}`;
  } else if (f.ex.type === 'hold') {
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
        updateDisguise();
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
  updateDisguise();
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
  const streak = store.touchStreak(S);
  if (streak.changed) session.streak = streak;
  const how = { ex: f.ex.name, type: f.ex.type, reps: f.ex.type === 'hold' ? f.maxHp : f.reps, pos: session.pos };
  if (!S.catchLog) S.catchLog = {};
  S.catchLog[m.id] = how;
  session.captured.push(Object.assign({ id: m.id, isNew, tierUp: tierUp && tierUp.name, pounds, xp }, how));
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
      ${session.silent ? '' : sparkles(m.rarity === 'common' ? 8 : 16)}
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
    const streak = store.touchStreak(S);
    if (streak.changed) session.streak = streak;
    if (session.silent) S.totals.meetingSessions = (S.totals.meetingSessions || 0) + 1;
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
    streak: session.streak,
  };
  const done = session;
  session = null;
  lastSummary = done;
  if (done.silent) setHush(true); // the results and the next half hour stay quiet too
  applySettings();
  if (!done.silent) {
    if (done.summary.levelUp) setTimeout(() => sfx.levelUp(), 300);
    else if (done.summary.pounds > 0) setTimeout(() => sfx.coin(), 300);
  }
  hook('finished', didSomething);
}

// ---------- Share your catch: a 1080x1350 PNG card through the phone's share sheet ----------
// navigator.share only works inside the tap that asked for it, so the card is drawn ahead of time (PF.warmShare when
// the Summary or the Monster dialog opens) and PF.shareCard(id) shares the cached file straight away. Without file
// sharing (most desktop browsers) the PNG downloads and the caption goes to the clipboard. Cancelling says nothing.

const RARITY_COLOUR = { common: '#a9b4bf', rare: '#3fa9ff', epic: '#c08aff', legendary: '#ffc531' };
const TIER_COLOUR = { bronze: '#d08a4c', silver: '#dfe6ec', gold: '#ffc531' };
const shareCache = new Map(); // monster id -> {sig, file, info, promise}

function shareInfo(id) {
  const m = D.MONSTER_BY_ID[id];
  const c = (m && S.caught[id]) || 0;
  if (!c) return null;
  const fromSession = lastSummary && lastSummary.captured.find((x) => x.id === id);
  const how = fromSession || (S.catchLog || {})[id] || null;
  const isNew = fromSession ? !!fromSession.isNew : c === 1;
  const pos = (how && how.pos) || D.HABITAT_POSITION[m.habitat];
  const place = D.PLACES[pos] || 'at my desk';
  const what = how && how.ex ? (how.type === 'hold' ? `a ${how.reps}-second ${how.ex}` : `${how.reps} ${how.ex}`) : '';
  const t = D.tierFor(c);
  const lv = store.levelInfo(S.xp);
  const unique = store.uniqueCaught(S);
  const the = /^the /i.test(m.name) ? m.name : `the ${m.name}`;
  const info = {
    m, isNew, tier: t && t.name ? t : null,
    caughtLine: what ? `Caught with ${what} ${place}` : `Caught ${place}`,
    levelLine: `Level ${lv.level} ${lv.rank} · ${unique}/${D.MONSTERS.length} caught`,
    caption: `I caught ${the}${what ? ` with ${what}` : ''} ${place}. Brain off, glutes on. https://poundfighter.com`,
    title: `${m.name} · PoundFighter`,
  };
  info.sig = [c, lv.level, unique, isNew, info.caughtLine].join('|');
  return info;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fitFont(g, text, weightFamily, size, maxW) {
  let px = size;
  g.font = `${weightFamily.replace('{px}', px)}`;
  while (px > 24 && g.measureText(text).width > maxW) {
    px -= 4;
    g.font = `${weightFamily.replace('{px}', px)}`;
  }
  return px;
}

function wrapLines(g, text, maxW, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
  }
  return lines;
}

function svgImage(svg, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('monster art did not load'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', `<svg width="${size}" height="${size}" `));
  });
}

async function drawCard(info) {
  const W = 1080, H = 1350;
  const { m } = info;
  const rc = RARITY_COLOUR[m.rarity];
  try {
    await Promise.all(['72px Bungee', '700 40px Rubik', 'italic 400 38px Rubik', '500 34px Rubik'].map((f) => document.fonts.load(f)));
  } catch (e) { /* system fonts then */ }
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#140e0c';
  g.fillRect(0, 0, W, H);
  // rays behind the monster, in its rarity colour
  const cx = W / 2, cy = 600;
  g.save();
  g.translate(cx, cy);
  g.globalAlpha = m.rarity === 'common' ? 0.06 : 0.1;
  g.fillStyle = rc;
  for (let i = 0; i < 18; i++) {
    g.rotate(Math.PI / 9);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(1000, -90);
    g.lineTo(1000, 90);
    g.closePath();
    g.fill();
  }
  g.restore();
  const glow = g.createRadialGradient(cx, cy, 40, cx, cy, 380);
  glow.addColorStop(0, 'rgba(255, 220, 160, .16)');
  glow.addColorStop(1, 'rgba(20, 14, 12, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  // the card frame (gold for a Gold card, else the rarity colour)
  roundRect(g, 36, 36, W - 72, H - 72, 56);
  g.lineWidth = 14;
  g.strokeStyle = info.tier && info.tier.id === 'gold' ? '#ffc531' : rc;
  g.stroke();
  // logo
  g.textBaseline = 'alphabetic';
  g.font = '60px Bungee';
  const a = 'POUND', b = 'FIGHTER';
  const wa = g.measureText(a).width, wb = g.measureText(b).width;
  let x = (W - wa - wb) / 2;
  g.textAlign = 'left';
  g.fillStyle = '#6b2a0c';
  g.fillText(a, x, 150 + 5);
  g.fillStyle = '#ff6b2c';
  g.fillText(a, x, 150);
  g.fillStyle = '#6b3a05';
  g.fillText(b, x + wa, 150 + 5);
  g.fillStyle = '#ffd34d';
  g.fillText(b, x + wa, 150);
  // the monster
  const img = await svgImage(monsterSVG(m), 560);
  g.drawImage(img, cx - 280, cy - 300, 560, 560);
  // NEW! ribbon across the top-right corner
  if (info.isNew) {
    g.save();
    g.translate(W - 190, 190);
    g.rotate(Math.PI / 4);
    g.fillStyle = '#5ad17a';
    g.fillRect(-260, -42, 520, 84);
    g.fillStyle = '#062210';
    g.font = '50px Bungee';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('NEW!', 0, 4);
    g.restore();
    g.textBaseline = 'alphabetic';
  }
  g.textAlign = 'center';
  // name
  const nameY = 960;
  fitFont(g, m.name.toUpperCase(), '{px}px Bungee', 76, W - 180);
  g.fillStyle = '#000000';
  g.globalAlpha = 0.5;
  g.fillText(m.name.toUpperCase(), cx, nameY + 5);
  g.globalAlpha = 1;
  g.fillStyle = '#fff3ea';
  g.fillText(m.name.toUpperCase(), cx, nameY);
  // rarity · habitat · tier
  const bits = [D.RARITIES[m.rarity].name.toUpperCase(), D.HABITATS[m.habitat].name.toUpperCase()];
  if (info.tier) bits.push(`${info.tier.name.toUpperCase()} CARD`);
  g.font = '700 36px Rubik';
  g.fillStyle = info.tier ? TIER_COLOUR[info.tier.id] : rc;
  g.fillText(bits.join('  ·  '), cx, nameY + 62);
  // flavour text
  g.font = 'italic 400 36px Rubik';
  g.fillStyle = '#e7d3c9';
  wrapLines(g, `“${m.flavor}”`, W - 220, 2).forEach((l, i) => g.fillText(l, cx, nameY + 128 + i * 46));
  // how it was caught + the player's level
  g.font = '700 40px Rubik';
  g.fillStyle = '#fff3ea';
  fitFont(g, info.caughtLine, '700 {px}px Rubik', 40, W - 180);
  g.fillText(info.caughtLine, cx, 1170);
  g.font = '500 32px Rubik';
  g.fillStyle = '#bda69b';
  g.fillText(info.levelLine, cx, 1218);
  // footer
  g.font = '34px Bungee';
  const dom = 'POUNDFIGHTER.COM';
  const tail = '  ·  Brain off, glutes on.';
  const wd = g.measureText(dom).width;
  g.font = '500 30px Rubik';
  const wt = g.measureText(tail).width;
  x = (W - wd - wt) / 2;
  g.textAlign = 'left';
  g.font = '34px Bungee';
  g.fillStyle = '#ffd34d';
  g.fillText(dom, x, 1284);
  g.font = '500 30px Rubik';
  g.fillStyle = '#bda69b';
  g.fillText(tail, x + wd, 1284);
  const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('the card could not be drawn');
  return new File([blob], `poundfighter-${m.id}.png`, { type: 'image/png' });
}

function prepareShare(id) {
  const info = shareInfo(id);
  if (!info) return Promise.reject(new Error('Catch this monster first.'));
  const hit = shareCache.get(id);
  if (hit && hit.sig === info.sig) return hit.promise;
  const entry = { sig: info.sig, info, file: null };
  entry.promise = drawCard(info).then((file) => { entry.file = file; return file; });
  entry.promise.catch(() => { if (shareCache.get(id) === entry) shareCache.delete(id); });
  shareCache.set(id, entry);
  return entry.promise;
}

function sharedOnce() {
  S.totals.shares = (S.totals.shares || 0) + 1;
  const badges = store.checkBadges(S, {});
  persist();
  badges.forEach((b) => hook('toast', `Badge unlocked: ${b.name}!`, 'ok'));
}

function downloadCard(entry) {
  const url = URL.createObjectURL(entry.file);
  const a = document.createElement('a');
  a.href = url;
  a.download = entry.file.name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
  window.__pfLastDownload = entry.file.name; // tests read this
  const done = (copied) => {
    hook('toast', copied ? 'Card saved, caption copied' : 'Card saved. Caption: ' + entry.info.caption, 'ok');
    sharedOnce();
  };
  try {
    navigator.clipboard.writeText(entry.info.caption).then(() => done(true), () => done(false));
  } catch (e) {
    done(false);
  }
}

function deliverCard(entry) {
  const data = { files: [entry.file], title: entry.info.title, text: entry.info.caption };
  let canFiles = false;
  try { canFiles = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [entry.file] })); } catch (e) { canFiles = false; }
  if (!canFiles) return downloadCard(entry);
  navigator.share(data).then(sharedOnce, (e) => {
    if (e && e.name === 'AbortError') return; // the player closed the share sheet: nothing to say
    downloadCard(entry); // the tap's permission ran out (or sharing failed): save it instead
  });
}

// Called straight from the Share button's click (no server call first, or the share sheet is refused)
function shareCard(id) {
  const info = shareInfo(id);
  if (!info) {
    hook('toast', 'Catch this monster first, then you can share its card.', 'error');
    return false;
  }
  const hit = shareCache.get(id);
  if (hit && hit.sig === info.sig && hit.file) {
    deliverCard(hit);
    return true;
  }
  prepareShare(id).then(() => deliverCard(shareCache.get(id)), () => hook('toast', 'The card could not be drawn on this device.', 'error'));
  return true;
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
  // Share your catch: warmShare when a Summary / Monster dialog opens (returns at once), shareCard inside the tap
  warmShare: (id) => { prepareShare(id).catch(() => {}); return true; },
  prepareShare: (id) => prepareShare(id).then((f) => ({ type: f.type, size: f.size, name: f.name })),
  shareCard,
  // Handy for testing in the console and in tools/ui/smoke.js
  debug: { get state() { return S; }, get session() { return session; }, detector, onRep, finish: () => finishSession(),
    forceExercise: (id) => { forceExercise = id; } },
};
if (window.__pfReady) window.__pfReady(window.PF);
