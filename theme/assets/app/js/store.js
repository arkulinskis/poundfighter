// Player progress, saved in this browser's localStorage.

import { MONSTERS, MONSTER_BY_ID, HABITATS, RANKS, QUEST_TEMPLATES, BADGES, tierFor } from './data.js';
import { seeded } from './monster-art.js';

const KEY = 'poundfighter.v2';

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function defaults() {
  return {
    v: 2,
    pounds: 0,
    xp: 0,
    totals: { reps: 0, micReps: 0, seconds: 0, sessions: 0, captures: 0, escapes: 0 },
    bestCombo: 0,
    caught: {}, // monsterId -> times caught
    firstCaught: {}, // monsterId -> day
    badges: {}, // badgeId -> day earned
    streak: { count: 0, last: null },
    days: {},
    inventory: { 'lure-rare': 0, 'lure-epic': 0, 'lure-legendary': 0 },
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
      nudge: 0, // minutes; 0 = off
      length: 3,
      micSetupDone: false,
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

export function load() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (e) { /* storage blocked or corrupt */ }
  return merge(defaults(), saved);
}

export function save(state) {
  // Keep only the last 21 days of daily records
  const keys = Object.keys(state.days).sort();
  while (keys.length > 21) delete state.days[keys.shift()];
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) { /* storage full or blocked; progress lasts this visit only */ }
}

export function resetAll() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  return defaults();
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
  const usedHabitat = { v: false };
  while (picked.length < 3 && pool.length) {
    const i = Math.floor(r() * pool.length);
    const t = pool.splice(i, 1)[0];
    if (t.type.startsWith('habitat')) {
      if (usedHabitat.v) continue;
      usedHabitat.v = true;
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
