/* Workday streak + Streak Shields: the rules in theme/assets/app/js/store.js, with faked dates.

    node tools/ui/streak_test.mjs          -> prints STREAK TESTS PASSED (tools/check.py runs it)

The engine modules are plain .js files without a package.json, so they are copied to a temp folder as .mjs first
(imports rewritten) and imported from there. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS = path.join(HERE, '..', '..', 'theme', 'assets', 'app', 'js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-streak-'));
for (const name of ['store', 'data', 'monster-art']) {
  const src = fs.readFileSync(path.join(JS, name + '.js'), 'utf8').replace(/from '\.\/([\w-]+)\.js'/g, "from './$1.mjs'");
  fs.writeFileSync(path.join(tmp, name + '.mjs'), src);
}
const store = await import(pathToFileURL(path.join(tmp, 'store.mjs')).href);
const { STREAK } = await import(pathToFileURL(path.join(tmp, 'data.mjs')).href);

let failed = 0;
function check(what, cond, detail) {
  if (cond) console.log('ok   ' + what);
  else { failed++; console.log('FAIL ' + what + (detail !== undefined ? '  (' + JSON.stringify(detail) + ')' : '')); }
}
// November 2026: Mon 16, Tue 17, Wed 18, Thu 19, Fri 20, Sat 21, Sun 22, Mon 23
const day = (d, h = 10) => new Date(2026, 10, d, h);
const fresh = () => store.fromData(null);
function fightOn(s, d) {
  const rec = store.getDay(s, store.dayKey(d));
  rec.sessions++;
  rec.reps += 10;
  return store.touchStreak(s, d);
}

// 1. Weekends off (the default): Friday -> Monday continues, and the chip shows the streak all weekend
let s = fresh();
check('weekends are off by default', s.settings.weekendsOff === true);
fightOn(s, day(19));
fightOn(s, day(20));
check('Sat: streak alive at 2', store.currentStreak(s, day(21)) === 2, store.streakState(s, day(21)));
check('Sun: streak alive at 2, rest day', store.streakState(s, day(22)).alive && store.streakState(s, day(22)).rest);
let r = fightOn(s, day(23));
check('Fri -> Mon continues the streak (3)', s.streak.count === 3 && !r.broken && r.shieldsUsed.length === 0, r);

// 2. Weekends switched off: the same gap breaks it
s = fresh();
s.settings.weekendsOff = false;
fightOn(s, day(20));
check('weekends count: Sun shows no streak', store.currentStreak(s, day(22)) === 0);
r = fightOn(s, day(23));
check('weekends count: Fri -> Mon restarts at 1', s.streak.count === 1 && r.broken && r.was === 1, r);

// 3. Mon -> Wed with 1 shield: the shield covers Tuesday
s = fresh();
s.totals.shieldsBought = 1;
fightOn(s, day(16));
let st = store.streakState(s, day(18));
check('Wed before fighting: alive, Tuesday needs a shield', st.alive && st.needed.length === 1 && st.needed[0] === '2026-11-17', st);
r = fightOn(s, day(18));
check('Mon -> Wed with 1 shield uses it', s.streak.count === 2 && r.shieldsUsed.join() === '2026-11-17', r);
check('the shield is gone and Tuesday is marked', store.shieldsHeld(s) === 0 && s.shieldDays['2026-11-17'] === '2026-11-18');

// 4. Mon -> Thu with 1 shield: two missed workdays, the streak restarts and the shield is kept
s = fresh();
s.totals.shieldsBought = 1;
fightOn(s, day(16));
st = store.streakState(s, day(19));
check('Thu before fighting: lost, one more shield would repair it', !st.alive && st.lost === 1 && st.repair === 1, st);
r = fightOn(s, day(19));
check('Mon -> Thu with 1 shield resets to 1', s.streak.count === 1 && r.broken && r.shieldsUsed.length === 0, r);
check('the shield is kept after a break', store.shieldsHeld(s) === 1);

// 5. A Saturday fight adds +1 (and Sunday rest doesn't break it)
s = fresh();
fightOn(s, day(20));
r = fightOn(s, day(21));
check('a Saturday fight adds +1', s.streak.count === 2 && r.changed, r);
fightOn(s, day(23));
check('Sat -> Mon continues (3)', s.streak.count === 3);
r = fightOn(s, day(23, 15));
check('a second fight the same day changes nothing', !r.changed && s.streak.count === 3, r);

// 6. Every 5th streak day earns a shield while you hold fewer than 2
s = fresh();
const earned = [];
for (let d = 2; d <= 27; d++) {
  const date = day(d);
  if (date.getDay() === 0 || date.getDay() === 6) continue;
  r = fightOn(s, date);
  if (r.shieldEarned) earned.push(r.count);
}
check('shields earned on days 5 and 10, then stop at 2 held', earned.join() === '5,10' && store.shieldsHeld(s) === 2, { earned, held: store.shieldsHeld(s), count: s.streak.count });
check('best streak is recorded', s.totals.bestStreak === s.streak.count && s.streak.count === 20, s.totals);
check('the cap matches data.js', STREAK.maxEarned === 2 && STREAK.shieldEvery === 5);

// 7. Old saves (calendar-day rule) are recounted from their history, never lowered
s = fresh();
const old = JSON.parse(JSON.stringify(s));
delete old.streakV;
for (const d of [9, 10, 11, 12, 13, 16, 17, 18, 19, 20]) old.days[store.dayKey(day(d))] = { sessions: 1, reps: 12, captures: 1, punches: [10], habitat: {}, quests: [], chests: {} };
old.days[store.dayKey(day(15))] = { sessions: 0, reps: 0, captures: 0, punches: [], habitat: {}, quests: [], chests: {} }; // opened Home on Sunday only
old.streak = { count: 5, last: '2026-11-20' }; // the old rule reset it on Monday the 16th
const migrated = store.fromData(old);
check('old save recounted from history: 10 workdays', migrated.streak.count === 10 && migrated.streakV === 2, migrated.streak);
old.streak = { count: 40, last: '2026-11-20' };
check('a longer stored streak is kept', store.fromData(old).streak.count === 40);
const again = store.fromData(migrated);
check('recounting runs once', again.streak.count === 10);

// 8. Merging keeps covered days from both devices (mirrors merge_progress)
const a = fresh(), b = fresh();
a.shieldDays = { '2026-11-17': '2026-11-18' };
b.shieldDays = { '2026-11-12': '2026-11-13', '2026-11-17': '2026-11-19' };
const m = store.mergeStates(a, b);
check('shieldDays union, earliest use kept', Object.keys(m.shieldDays).length === 2 && m.shieldDays['2026-11-17'] === '2026-11-18', m.shieldDays);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `${failed} STREAK TEST(S) FAILED` : 'STREAK TESTS PASSED');
process.exit(failed ? 1 : 0);
