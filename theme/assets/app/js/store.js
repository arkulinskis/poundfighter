// Player progress, saved in this browser's localStorage (and synced to the
// player's account when they are signed in, see online.js).

import { MONSTERS, MONSTER_BY_ID, HABITATS, RANKS, QUEST_TEMPLATES, BADGES, tierFor } from './data.js';
import { seeded } from './monster-art.js';

const KEY = 'poundfighter.v2';
const DEVICE_KEY = 'poundfighter.device';

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function defaults() {
  return {
    v: 3,
    owner: null, // email of the account this progress belongs to (null = guest)
    // Pounds are tracked as two ever-growing totals so that merging copies
    // from two devices can never "refund" a purchase. Balance = earned - spent.
    earned: 0,
    spent: 0,
    xp: 0,
    totals: { reps: 0, micReps: 0, seconds: 0, sessions: 0, captures: 0, escapes: 0 },
    bestCombo: 0,
    caught: {}, // monsterId -> times caught
    firstCaught: {}, // monsterId -> day
    badges: {}, // badgeId -> day earned
    streak: { count: 0, last: null },
    days: {},
    lureBought: {}, // lureId -> total ever bought
    lureUsed: {}, // lureId -> total ever used
    armedLure: null,
    arenas: ['dojo'],
    arena: 'dojo',
    lastSessionAt: 0,
    settings: {
      mic: true,
      sensitivity: 14,
      minGap: 450,
      sound: true,
      vibrate: true,
      length: 3,
      micSetupDone: false,
      reminders: { on: false, start: 9, end: 17, every: 60, weekdays: true },
    },
  };
}

function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  for (const k of Object.keys(saved)) {
    const b = base[k];
    const s = saved[k];
    if (b && typeof b === 'object' && !Array.isArray(b) && s && typeof s === 'object' && !Array.isArray(s)) {
      base[k] = merge(b, s);
    } else {
      base[k] = s;
    }
  }
  return base;
}

// Older saves kept a plain pounds balance and lure inventory
function migrate(saved) {
  if (!saved || typeof saved !== 'object') return saved;
  if (saved.earned === undefined && typeof saved.pounds === 'number') {
    saved.earned = saved.pounds;
    saved.spent = 0;
  }
  if (saved.inventory && !saved.lureBought) {
    saved.lureBought = { ...saved.inventory };
    saved.lureUsed = {};
  }
  delete saved.pounds;
  delete saved.inventory;
  return saved;
}

export function fromData(data) {
  return merge(defaults(), migrate(data && JSON.parse(JSON.stringify(data))));
}

export function load() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (e) { /* storage blocked or corrupt */ }
  return fromData(saved);
}

export function save(state) {
  // Keep only the last 21 days of daily records
  const keys = Object.keys(state.days).sort();
  while (keys.length > 21) delete state.days[keys.shift()];
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) { /* storage full or blocked; progress lasts this visit only */ }
}

export function resetAll(keepSettings) {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  const s = defaults();
  if (keepSettings) s.settings = merge(s.settings, keepSettings);
  return s;
}

// Things that belong to this device only (never synced)
export function deviceGet() {
  try { return JSON.parse(localStorage.getItem(DEVICE_KEY) || '{}'); } catch (e) { return {}; }
}
export function deviceSet(patch) {
  const d = { ...deviceGet(), ...patch };
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ }
  return d;
}

// ---------- Pounds and lures ----------

export const pounds = (s) => Math.max(0, (s.earned || 0) - (s.spent || 0));
export const addPounds = (s, n) => { s.earned = (s.earned || 0) + n; };
export function spend(s, n) {
  if (pounds(s) < n) return false;
  s.spent = (s.spent || 0) + n;
  return true;
}
export const lureCount = (s, id) => Math.max(0, (s.lureBought[id] || 0) - (s.lureUsed[id] || 0));
export const addLure = (s, id) => { s.lureBought[id] = (s.lureBought[id] || 0) + 1; };
export const useLure = (s, id) => { s.lureUsed[id] = (s.lureUsed[id] || 0) + 1; };

// ---------- Merging two copies (mirrors merge_progress in server_code) ----------

const isNum = (x) => typeof x === 'number' && isFinite(x);
const maxNum = (a, b) => (isNum(a) && isNum(b) ? Math.max(a, b) : isNum(a) ? a : isNum(b) ? b : a ?? b);
const maxDict = (a = {}, b = {}) => {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) out[k] = maxNum(out[k], v);
  return out;
};

function mergeDays(a = {}, b = {}) {
  const out = {};
  for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const x = a?.[key], y = b?.[key];
    if (!x || !y) { out[key] = x || y; continue; }
    const d = { ...y };
    for (const k of ['reps', 'micReps', 'captures', 'rareCaptures', 'maxCombo', 'sessions']) d[k] = maxNum(x[k], y[k]) || 0;
    d.punches = [...new Set([...(x.punches || []), ...(y.punches || [])])].sort((p, q) => p - q).slice(0, 8);
    d.habitat = maxDict(x.habitat, y.habitat);
    d.chests = Object.fromEntries([...new Set([...Object.keys(x.chests || {}), ...Object.keys(y.chests || {})])].map((k) => [k, true]));
    const qx = x.quests || [], qy = y.quests || [];
    if (qx.length === qy.length) d.quests = qy.map((q, i) => ({ ...q, claimed: !!(q.claimed || qx[i].claimed) }));
    out[key] = d;
  }
  for (const k of Object.keys(out).sort().slice(0, -21)) delete out[k];
  return out;
}

// Counters only ever go up, so the larger value wins. Preferences come from
// `incoming` (this device).
export function mergeStates(stored, incoming) {
  if (!stored) return incoming;
  if (!incoming) return stored;
  const a = stored, b = incoming;
  const out = { ...b };
  for (const k of ['xp', 'earned', 'spent', 'bestCombo', 'lastSessionAt']) out[k] = maxNum(a[k], b[k]) || 0;
  for (const k of ['totals', 'caught', 'lureBought', 'lureUsed']) out[k] = maxDict(a[k], b[k]);
  for (const k of ['firstCaught', 'badges']) {
    const m = { ...(a[k] || {}) };
    for (const [key, day] of Object.entries(b[k] || {})) m[key] = key in m ? (m[key] < day ? m[key] : day) : day;
    out[k] = m;
  }
  const sa = a.streak || {}, sb = b.streak || {};
  const la = sa.last || '', lb = sb.last || '';
  out.streak = la > lb ? sa : lb > la ? sb : { last: sb.last, count: maxNum(sa.count, sb.count) || 0 };
  out.arenas = [...new Set([...(a.arenas || []), ...(b.arenas || [])])].sort();
  out.days = mergeDays(a.days, b.days);
  return out;
}

// ---------- Days, quests, streak ----------

export function getDay(state, key = dayKey()) {
  if (!state.days[key]) {
    state.days[key] = {
      reps: 0, micReps: 0, captures: 0, rareCaptures: 0, maxCombo: 0, sessions: 0,
      punches: [], // hours of the day that got a punch
      habitat: { bedroom: 0, office: 0, lounge: 0 },
      quests: makeQuests(key),
      chests: {},
    };
  }
  return state.days[key];
}

function makeQuests(key) {
  const r = seeded('quests:' + key);
  const pool = [...QUEST_TEMPLATES];
  const picked = [];
  let usedHabitat = false;
  while (picked.length < 3 && pool.length) {
    const i = Math.floor(r() * pool.length);
    const t = pool.splice(i, 1)[0];
    if (t.type.startsWith('habitat')) {
      if (usedHabitat) continue;
      usedHabitat = true;
    }
    const target = t.targets[Math.floor(r() * t.targets.length)];
    picked.push({ type: t.type, target, claimed: false });
  }
  return picked;
}

export function questInfo(day, q) {
  const t = QUEST_TEMPLATES.find((x) => x.type === q.type);
  let value;
  if (t.metric.startsWith('cap:')) value = day.habitat[t.metric.slice(4)] || 0;
  else if (t.metric === 'punches') value = day.punches.length;
  else value = day[t.metric] || 0;
  return { text: t.text(q.target), value: Math.min(value, q.target), target: q.target, done: value >= q.target, reward: t.reward };
}

export function touchStreak(state) {
  const today = dayKey();
  if (state.streak.last === today) return;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  state.streak.count = state.streak.last === dayKey(y) ? state.streak.count + 1 : 1;
  state.streak.last = today;
}

export function currentStreak(state) {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (state.streak.last === dayKey() || state.streak.last === dayKey(y)) return state.streak.count;
  return 0;
}

// ---------- Levels ----------

export const xpToNext = (level) => 80 + level * 40;

export function levelInfo(xp) {
  let level = 1;
  let rest = xp;
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  const rank = [...RANKS].reverse().find((r) => level >= r.level);
  return { level, into: rest, need: xpToNext(level), pct: rest / xpToNext(level), rank: rank.name };
}

// ---------- Collection ----------

export function habitatProgress(state, habitat) {
  const list = MONSTERS.filter((m) => m.habitat === habitat);
  const got = list.filter((m) => state.caught[m.id]).length;
  return { got, total: list.length };
}

export const uniqueCaught = (state) => Object.keys(state.caught).filter((id) => MONSTER_BY_ID[id]).length;

// ---------- Badges ----------

export function checkBadges(state, ctx = {}) {
  const earned = [];
  const has = (id) => !!state.badges[id];
  const give = (id) => {
    if (!has(id)) {
      state.badges[id] = dayKey();
      earned.push(BADGES.find((b) => b.id === id));
    }
  };
  const t = state.totals;
  if (t.reps >= 1) give('first-blood');
  if (t.reps >= 100) give('centurion');
  if (t.reps >= 1000) give('thousand');
  if (t.micReps >= 100) give('loud');
  if (uniqueCaught(state) >= 10) give('collector');
  if (Object.keys(HABITATS).some((h) => { const p = habitatProgress(state, h); return p.got === p.total; })) give('habitat-hero');
  if (uniqueCaught(state) >= MONSTERS.length) give('all');
  if (MONSTERS.some((m) => m.rarity === 'legendary' && state.caught[m.id])) give('legend');
  if (state.streak.count >= 7) give('week');
  if (getDay(state).punches.length >= 8) give('full-card');
  if (state.bestCombo >= 15) give('combo');
  if (ctx.hour !== undefined && ctx.hour < 8 && ctx.hour >= 4) give('early');
  if (ctx.hour !== undefined && (ctx.hour >= 22 || ctx.hour < 4)) give('owl');
  if (Object.values(state.caught).some((c) => tierFor(c) && tierFor(c).id === 'gold')) give('gold-card');
  return earned;
}
