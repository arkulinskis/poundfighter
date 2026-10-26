import * as D from './data.js';
import { monsterSVG, seeded } from './monster-art.js';
import { RepDetector, dbToMeter } from './mic.js';
import { sfx, configureSfx, getAudioContext } from './sfx.js';
import * as store from './store.js';
import { esc, $, fmtNum, fmtTime, I, coin, toast, openModal, closeModal, modalOpen } from './ui.js';
import { hasHost } from './bridge.js';
import { online, initOnline, scheduleSync, accountPanel, viewAdmin, loadAdmin, onlineActions, APP_VERSION } from './online.js';
import { initReminders, remindersPanel, reminderActions, maybeAskAfterSession, noteActivity, canInstall, env } from './reminders.js';

// ---------- State ----------

let S = store.load();
const saveLocal = () => store.save(S);
// Save on this device, then sync to the account (if signed in) a moment later
const persist = () => {
  store.save(S);
  scheduleSync();
};

const app = document.getElementById('app');

let route = 'home';
let collectionTab = 'bedroom';
let session = null;
let micTest = null; // { count } while the mic tuning dialog is open

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
const POS_ICON = { bed: I.bed, sitting: I.desk, standing: I.stand };

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

// ---------- Shared chrome ----------

function topbar() {
  const lv = store.levelInfo(S.xp);
  const streak = store.currentStreak(S);
  return `<header class="topbar">
    <button class="lvl-block" data-action="go" data-to="me" aria-label="Your profile">
      <span class="lvl-badge shiny">${lv.level}</span>
      <span class="lvl-text"><span class="rank">${esc(lv.rank)}</span><span class="xpbar"><i style="width:${(lv.pct * 100).toFixed(1)}%"></i></span></span>
    </button>
    <div class="top-chips">
      <span class="chip ${streak ? 'hot' : ''}" title="Day streak">${I.flame}${streak}</span>
      <span class="chip gold shiny" title="Pounds">${coin(store.pounds(S))}</span>
    </div>
  </header>`;
}

function tabbar(active) {
  const tab = (id, label, icon) => `<button class="tab ${active === id ? 'on' : ''}" data-action="go" data-to="${id}">${icon}<span>${label}</span></button>`;
  return `<nav class="tabbar">${tab('home', 'Fight', I.zap)}${tab('collection', 'Collection', I.grid)}${tab('shop', 'Shop', I.bag)}${tab('me', 'Me', I.user)}</nav>`;
}

function render() {
  document.body.dataset.route = route;
  if (route === 'fight') return renderFight();
  const views = { home: viewHome, collection: viewCollection, shop: viewShop, me: viewMe, summary: viewSummary, admin: viewAdmin };
  app.innerHTML = views[route]();
}

function go(to) {
  if (to === 'admin' && !(online.account && online.account.is_admin)) to = 'me';
  route = to;
  render();
  window.scrollTo(0, 0);
  if (to === 'admin') loadAdmin();
}

// Re-render after background changes (sync, sign-in), but never mid-fight or mid-typing
function refresh() {
  if (route === 'fight') return;
  const a = document.activeElement;
  if (a && app.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

// ---------- Home ----------

function punchCard(day) {
  const slots = [];
  for (let i = 0; i < D.PUNCH_SLOTS; i++) {
    const h = day.punches[i];
    const chestAt = D.CHESTS.find((c) => c.at === i + 1);
    slots.push(`<div class="punch ${h !== undefined ? 'on' : ''} ${chestAt ? 'chest' : ''}">
      ${h !== undefined ? `<span>${hourLabel(h)}</span>` : chestAt ? I.gift : `<span>${i + 1}</span>`}
    </div>`);
  }
  return `<div class="punches">${slots.join('')}</div>`;
}

function questList(day) {
  return day.quests.map((q) => {
    const info = store.questInfo(day, q);
    return `<li class="quest ${q.claimed ? 'claimed' : ''}">
      <div class="q-row"><span class="q-text">${q.claimed ? I.check : ''}${esc(info.text)}</span><span class="q-reward">${coin(info.reward)}</span></div>
      <div class="bar"><i style="width:${(info.value / info.target) * 100}%"></i></div>
      <div class="q-num">${info.value} / ${info.target}</div>
    </li>`;
  }).join('');
}

function sightings() {
  const r = seeded('sight:' + store.dayKey());
  const uncaught = D.MONSTERS.filter((m) => !S.caught[m.id] && m.rarity !== 'legendary');
  if (!uncaught.length) return '';
  const pool = [...uncaught];
  const picks = [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return `<section class="panel">
    <div class="panel-head"><h2>Wild sightings</h2><span class="muted small">Not yet captured</span></div>
    <div class="sightings">${picks.map((m) => `<div class="sighting">
      <div class="sil">${monsterSVG(m)}</div>
      <span class="small">Seen in the <b>${D.HABITATS[m.habitat].name}</b></span>
    </div>`).join('')}</div>
  </section>`;
}

function installCard() {
  if (!hasHost || !canInstall() || store.deviceGet().hideInstall) return '';
  return `<section class="panel install-card gold-panel">
    <div class="acct-crest">${I.download}</div>
    <div class="install-text"><b>Install PoundFighter</b><span class="small">Opens in one tap, and can remind you to move during the day.</span></div>
    <button class="btn small gold" data-action="install">Install</button>
    <button class="icon-btn small" data-action="hide-install" aria-label="Hide">${I.x}</button>
  </section>`;
}

function viewHome() {
  const day = store.getDay(S);
  const len = S.settings.length;
  const micOn = S.settings.mic && detector.supported;
  const lure = S.armedLure && store.lureCount(S, S.armedLure) > 0 ? D.LURES.find((l) => l.id === S.armedLure) : null;
  return `${topbar()}
  <main class="page">
    <section class="hero">
      <div class="mascot shiny" role="img" aria-label="PoundFighter mascot"></div>
      <div class="logo">POUND<span class="gold-text">FIGHTER</span></div>
      <p class="tag">Brain off, glutes on.</p>
    </section>
    ${installCard()}

    <section class="panel">
      <div class="panel-head"><h2>Where are you?</h2></div>
      <div class="seg" role="radiogroup" aria-label="Session length">
        ${D.SESSION_LENGTHS.map((l) => `<button class="seg-btn ${len === l.id ? 'on' : ''}" data-action="set-length" data-len="${l.id}" role="radio" aria-checked="${len === l.id}">
          <b>${l.name}</b><span>${l.fights} fight${l.fights > 1 ? 's' : ''} · ${l.hint}</span></button>`).join('')}
      </div>
      <div class="positions">
        ${Object.values(D.POSITIONS).map((p) => {
          const prog = store.habitatProgress(S, p.habitat);
          return `<button class="pos-btn pos-${p.id}" data-action="start" data-pos="${p.id}">
            <span class="pos-icon">${POS_ICON[p.id]}</span>
            <span class="pos-label">${p.label}</span>
            <span class="pos-sub">${D.HABITATS[p.habitat].name} · ${prog.got}/${prog.total} caught</span>
            <span class="pos-go">FIGHT</span>
          </button>`;
        }).join('')}
      </div>
      <div class="mic-row">
        <button class="switch ${micOn ? 'on' : ''}" data-action="toggle-mic" role="switch" aria-checked="${micOn}" aria-label="Voice reps"><i></i></button>
        <div class="mic-text">
          <b>${micOn ? I.mic : I.micOff} Voice reps ${micOn ? 'on' : 'off'}</b>
          <span class="small muted">${micOn ? 'Grunt, clap or say “HUP!” on each rep. Screen stays awake.' : 'Tap the monster to count each rep instead.'}</span>
        </div>
        ${micOn ? `<button class="link" data-action="mic-test">Test</button>` : ''}
      </div>
      ${lure ? `<div class="lure-armed">${I.magnet} <b>${esc(lure.name)}</b> armed for your next fight</div>` : ''}
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Today's punch card</h2><span class="muted small">${day.punches.length}/${D.PUNCH_SLOTS}</span></div>
      <p class="muted small">Fight in a new hour of the day to earn a punch. Chests at 4 and 8. Little and often beats one big workout.</p>
      ${punchCard(day)}
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Daily quests</h2><span class="muted small">New ones tomorrow</span></div>
      <ul class="quests">${questList(day)}</ul>
    </section>

    ${sightings()}
    <p class="foot-links small"><button class="link" data-action="feedback" data-kind="bug">${I.bug} Found a bug?</button><button class="link" data-action="feedback" data-kind="idea">Got an idea?</button></p>
  </main>
  ${tabbar('home')}`;
}

// ---------- Collection ----------

function cardTierLabel(count) {
  const t = D.tierFor(count);
  return t && t.name ? `<span class="tier tier-${t.id}">${t.name}</span>` : '';
}

function viewCollection() {
  const unique = store.uniqueCaught(S);
  const list = D.MONSTERS.filter((m) => m.habitat === collectionTab);
  return `${topbar()}
  <main class="page">
    <section class="page-head">
      <h1>Collection</h1>
      <p class="muted">${unique} of ${D.MONSTERS.length} monsters captured</p>
      <div class="bar big"><i style="width:${(unique / D.MONSTERS.length) * 100}%"></i></div>
    </section>
    <div class="htabs">
      ${Object.values(D.HABITATS).map((h) => {
        const p = store.habitatProgress(S, h.id);
        return `<button class="htab ${collectionTab === h.id ? 'on' : ''}" data-action="ctab" data-h="${h.id}">${h.name}<span>${p.got}/${p.total}</span></button>`;
      }).join('')}
    </div>
    <p class="muted small habitat-blurb">${esc(D.HABITATS[collectionTab].blurb)} ${esc(D.HABITATS[collectionTab].where)}</p>
    <div class="cards">
      ${list.map((m) => {
        const c = S.caught[m.id] || 0;
        if (!c) {
          return `<button class="mcard locked r-${m.rarity}" data-action="monster" data-id="${m.id}">
            <div class="mcard-art ${m.rarity === 'legendary' ? 'mystery' : 'sil'}">${m.rarity === 'legendary' ? '<span>?</span>' : monsterSVG(m)}</div>
            <div class="mcard-name">???</div>
            <div class="mcard-rar">${rarityName(m.rarity)}</div>
          </button>`;
        }
        const t = D.tierFor(c);
        return `<button class="mcard r-${m.rarity} t-${t.id}" data-action="monster" data-id="${m.id}">
          <div class="mcard-art">${monsterSVG(m)}</div>
          <div class="mcard-name">${esc(m.name)}</div>
          <div class="mcard-rar">${rarityName(m.rarity)} · ×${c}</div>
        </button>`;
      }).join('')}
    </div>
  </main>
  ${tabbar('collection')}`;
}

function showMonster(id) {
  const m = D.MONSTER_BY_ID[id];
  const c = S.caught[m.id] || 0;
  if (!c) {
    openModal(`<div class="mdetail locked r-${m.rarity}">
      <div class="mdetail-art ${m.rarity === 'legendary' ? 'mystery' : 'sil'}">${m.rarity === 'legendary' ? '<span>?</span>' : monsterSVG(m)}</div>
      <h3>???</h3>
      <p class="rar-line"><span class="rar r-${m.rarity}">${rarityName(m.rarity)}</span> · ${D.HABITATS[m.habitat].name}</p>
      <p class="muted">Not captured yet. ${m.rarity === 'legendary' ? 'Legends rarely show themselves. A Legendary Lure might help.' : 'Keep fighting in this habitat.'}</p>
      <button class="btn" data-action="close-modal">Close</button>
    </div>`);
    return;
  }
  const t = D.tierFor(c);
  const next = [...D.CARD_TIERS].reverse().find((x) => x.min > c);
  openModal(`<div class="mdetail r-${m.rarity} t-${t.id}">
    <div class="mdetail-art">${monsterSVG(m)}</div>
    <h3>${esc(m.name)}</h3>
    <p class="rar-line"><span class="rar r-${m.rarity}">${rarityName(m.rarity)}</span> · ${D.HABITATS[m.habitat].name} ${cardTierLabel(c)}</p>
    <p class="flavor">“${esc(m.flavor)}”</p>
    <p class="muted small">Captured ×${c}${S.firstCaught[m.id] ? ` · first on ${S.firstCaught[m.id]}` : ''}${next ? ` · ${next.min - c} more for ${next.name}` : ' · Max tier!'}</p>
    <button class="btn" data-action="close-modal">Close</button>
  </div>`);
}

// ---------- Shop ----------

function viewShop() {
  return `${topbar()}
  <main class="page">
    <section class="page-head">
      <h1>Shop</h1>
      <p class="muted">Every rep earns pounds. Combos earn more. You have ${coin(store.pounds(S))}</p>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Lures</h2><span class="muted small">Used up on your next fight</span></div>
      <div class="shop-list">
        ${D.LURES.map((l) => {
          const owned = store.lureCount(S, l.id);
          const armed = S.armedLure === l.id && owned > 0;
          return `<div class="shop-item r-${l.rarity}">
            <div class="shop-icon">${I.magnet}</div>
            <div class="shop-text"><b>${esc(l.name)}</b><span class="small muted">${esc(l.desc)}</span>${owned ? `<span class="small">Owned: ${owned}</span>` : ''}</div>
            <div class="shop-actions">
              <button class="btn small ${store.pounds(S) < l.price ? 'disabled' : 'gold'}" data-action="buy-lure" data-id="${l.id}">${coin(l.price)}</button>
              ${owned ? `<button class="btn small ${armed ? 'on' : ''}" data-action="arm-lure" data-id="${l.id}">${armed ? 'Armed' : 'Arm'}</button>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Arenas</h2><span class="muted small">Where your fights happen</span></div>
      <div class="arenas">
        ${D.ARENAS.map((a) => {
          const owned = S.arenas.includes(a.id);
          const using = S.arena === a.id;
          return `<button class="arena-tile arena-${a.id} ${using ? 'on' : ''}" data-action="arena" data-id="${a.id}">
            <span class="arena-name">${esc(a.name)}</span>
            <span class="arena-state">${using ? 'Using' : owned ? 'Use' : coin(a.price)}</span>
          </button>`;
        }).join('')}
      </div>
    </section>
  </main>
  ${tabbar('shop')}`;
}

// ---------- Me (stats, badges, settings) ----------

function viewMe() {
  const lv = store.levelInfo(S.xp);
  const t = S.totals;
  const st = S.settings;
  const stat = (label, value) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`;
  return `${topbar()}
  <main class="page">
    <section class="page-head profile">
      <div class="lvl-big shiny">${lv.level}</div>
      <div>
        <h1 class="gold-text">${esc(lv.rank)}</h1>
        <div class="bar big"><i style="width:${lv.pct * 100}%"></i></div>
        <p class="muted small">${fmtNum(lv.into)} / ${fmtNum(lv.need)} XP to level ${lv.level + 1}</p>
      </div>
    </section>
    ${accountPanel()}
    <section class="stats">
      ${stat('Reps', fmtNum(t.reps))}${stat('By voice', fmtNum(t.micReps))}${stat('Time', fmtTime(t.seconds))}
      ${stat('Sessions', fmtNum(t.sessions))}${stat('Captured', fmtNum(t.captures))}${stat('Best combo', `×${S.bestCombo}`)}
    </section>
    ${remindersPanel()}
    <section class="panel">
      <div class="panel-head"><h2>Badges</h2><span class="muted small">${Object.keys(S.badges).length}/${D.BADGES.length}</span></div>
      <div class="badges">
        ${D.BADGES.map((b) => `<div class="badge ${S.badges[b.id] ? 'on' : ''}" title="${esc(b.desc)}">
          <span class="badge-icon">${S.badges[b.id] ? I.medal : I.lock}</span>
          <b>${esc(b.name)}</b><span class="small muted">${esc(b.desc)}</span>
        </div>`).join('')}
      </div>
    </section>
    <section class="panel settings">
      <div class="panel-head"><h2>Settings</h2></div>
      <label class="set-row">
        <span><b>Voice reps</b><span class="small muted">Count a rep when the mic hears a sound well above the room's background noise.</span></span>
        <button class="switch ${st.mic ? 'on' : ''}" data-action="toggle-mic" role="switch" aria-checked="${st.mic}"><i></i></button>
      </label>
      <div class="set-row"><span><b>Tune the mic</b><span class="small muted">See what it hears and test your rep noise.</span></span><button class="btn small" data-action="mic-test">Open</button></div>
      <label class="set-col">
        <span><b>Sensitivity</b> <span class="small muted" id="sensVal">${sensLabel(st.sensitivity)}</span></span>
        <input type="range" min="6" max="30" step="1" value="${36 - st.sensitivity}" data-setting="sensitivity" aria-label="Sensitivity">
        <span class="range-ends small muted"><span>Needs a shout</span><span>Hears a whisper</span></span>
      </label>
      <label class="set-col">
        <span><b>Minimum time between reps</b> <span class="small muted" id="gapVal">${(st.minGap / 1000).toFixed(2)}s</span></span>
        <input type="range" min="250" max="1500" step="50" value="${st.minGap}" data-setting="minGap" aria-label="Minimum time between reps">
      </label>
      <label class="set-row"><span><b>Sound effects</b></span><button class="switch ${st.sound ? 'on' : ''}" data-action="toggle" data-key="sound" role="switch" aria-checked="${st.sound}"><i></i></button></label>
      <label class="set-row"><span><b>Vibration</b></span><button class="switch ${st.vibrate ? 'on' : ''}" data-action="toggle" data-key="vibrate" role="switch" aria-checked="${st.vibrate}"><i></i></button></label>
      <div class="set-row"><span><b>Send feedback</b><span class="small muted">Report a bug or suggest an idea.</span></span><button class="btn small" data-action="feedback" data-kind="bug">${I.bug} Report</button></div>
      ${online.account ? '' : `<div class="set-row"><span><b>Reset progress</b><span class="small muted">Wipes the progress saved on this device.</span></span><button class="btn small danger" data-action="reset">Reset</button></div>`}
    </section>
    <p class="foot-links small muted">PoundFighter v${APP_VERSION}</p>
  </main>
  ${tabbar('me')}`;
}

const sensLabel = (s) => (s <= 10 ? 'High' : s <= 18 ? 'Medium' : 'Low') + ` (${s} dB)`;

// ---------- Mic tuning dialog ----------

async function openMicTest() {
  getAudioContext();
  micTest = { count: 0 };
  openModal(`<div class="mictest">
    <h3>${I.mic} Tune your mic</h3>
    <p class="muted small" id="tStatus">Asking for microphone access…</p>
    <div class="meter big" aria-hidden="true"><div class="lvl" id="tLvl"></div><div class="base" id="tBase"></div><div class="thr" id="tThr"></div></div>
    <div class="legend small muted"><span><i class="k-lvl"></i>What it hears</span><span><i class="k-thr"></i>Rep line</span></div>
    <div class="tcount"><b id="tCount">0</b><span>reps heard</span></div>
    <label class="set-col">
      <span><b>Sensitivity</b> <span class="small muted" id="sensVal2">${sensLabel(S.settings.sensitivity)}</span></span>
      <input type="range" min="6" max="30" step="1" value="${36 - S.settings.sensitivity}" data-setting="sensitivity" aria-label="Sensitivity">
    </label>
    <div class="row-btns">
      <button class="btn" data-action="recalibrate">Re-measure room</button>
      <button class="btn primary" data-action="close-modal">Done</button>
    </div>
  </div>`, {
    onClose: () => {
      micTest = null;
      if (!session) detector.stop();
    },
  });
  try {
    await detector.start();
    detector.listening = true;
    detector.recalibrate();
    const st = $('tStatus');
    if (st) st.textContent = 'Stay quiet for a second… then grunt, clap or say “HUP!”. Each time the bar jumps past the rep line, it counts.';
    S.settings.micSetupDone = true;
    persist();
  } catch (e) {
    const st = $('tStatus');
    if (st) st.innerHTML = micErrorText(e);
  }
}

function micErrorText(e) {
  if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
    return 'Microphone access was blocked. Allow it in your browser’s site settings, or turn Voice reps off and tap to count.';
  }
  return 'Could not start the microphone on this device. You can still tap to count reps.';
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

// ---------- Fight session ----------

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

async function startSession(pos) {
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
  render();
  keepAwake(true);
  session.ticker = setInterval(sessionTick, 250);
  if (session.mic) {
    try {
      await detector.start();
      if (session) session.mic = true;
    } catch (e) {
      if (session) session.mic = false;
      toast(micErrorText(e), 'warn');
    }
    updateMicBar();
  }
  if (session) beginRound();
}

const cur = () => session && session.fights[session.index];

function renderFight() {
  const f = cur();
  const { ex, monster } = f;
  const isHold = ex.type === 'hold';
  const tiles = Array.from({ length: 36 }, () => '<i></i>').join('');
  app.innerHTML = `<div class="fight arena-${S.arena}">
    <header class="fight-top">
      <div class="round">Fight ${session.index + 1}<span>/${session.fights.length}</span></div>
      <div class="ftimer" id="fTimer">${fmtTime((Date.now() - session.startedAt) / 1000)}</div>
      <button class="icon-btn" data-action="end-session" aria-label="End session">${I.x}</button>
    </header>
    <section class="ex">
      <div class="ex-type">${isHold ? `${f.maxHp}s hold` : `${f.maxHp} reps`}</div>
      <h2 class="ex-name">${esc(ex.name)}</h2>
      <p class="ex-desc">${esc(ex.desc)}</p>
    </section>
    <section class="stage r-${monster.rarity}" id="stage" ${isHold ? '' : 'data-tap="1"'}>
      <div class="rarity-tag">${rarityName(monster.rarity)}${monster.rarity !== 'common' ? ' presence' : ''}</div>
      <div class="mframe" id="mframe">
        <div class="mart" id="mart">${monsterSVG(monster)}</div>
        <div class="fog" id="fog">${tiles}</div>
        <div class="pops" id="pops"></div>
      </div>
      <div class="mname" id="mname">???</div>
      <div class="hp"><i id="hpFill" style="width:100%"></i><span id="hpText">${f.hp} / ${f.maxHp}</span></div>
    </section>
    <section class="counter">
      <div class="count"><b id="repNow">${isHold ? f.hp : 0}</b><span>${isHold ? 'seconds left' : `/ ${f.maxHp} reps`}</span></div>
      <div class="combo" id="combo"></div>
    </section>
    <section class="micbar" id="micbar">
      <div class="meter"><div class="lvl" id="mLvl"></div><div class="thr" id="mThr"></div></div>
      <div class="miclabel" id="micLabel"></div>
    </section>
    <footer class="fight-foot">
      <span class="hint">${isHold ? 'Hold it! The monster melts while you hold.' : 'No mic? Tap the monster or press space for each rep.'}</span>
      <button class="link" data-action="skip-fight">${I.skip} Let it escape</button>
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
    if (!session || cur() !== f) return;
    ov.className = 'overlay show ready';
    ov.innerHTML = `<div class="ready-box">
      <div class="ready-sub">Fight ${session.index + 1} · ${f.ex.type === 'hold' ? `Hold ${f.maxHp}s` : `${f.maxHp} reps`}</div>
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
  if (fill) fill.style.width = `${(f.hp / f.maxHp) * 100}%`;
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
  $('mname').textContent = m.name;
  $('stage').classList.add('won');
  const last = session.index >= session.fights.length - 1;
  const ov = $('overlay');
  setTimeout(() => {
    if (!session || cur() !== f) return;
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
      <button class="btn primary big" data-action="next-fight">${last ? 'See results' : 'Next fight'} <span class="auto" id="autoN"></span></button>
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
  $('stage').classList.add('fled');
  const last = session.index >= session.fights.length - 1;
  const ov = $('overlay');
  f.canAdvance = true;
  ov.className = 'overlay show escaped';
  ov.innerHTML = `<div class="ready-box">
    <div class="ready-name">It got away…</div>
    <p class="muted">${f.reps ? `You landed ${f.reps} rep${f.reps > 1 ? 's' : ''}. Those still count.` : 'No harm done. Plenty more where that came from.'}</p>
    <button class="btn primary big" data-action="next-fight">${last ? 'See results' : 'Next fight'} <span class="auto" id="autoN"></span></button>
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
  const badges = checkBadgesNow(session.hour);
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
  route = 'summary';
  render();
  window.scrollTo(0, 0);
  if (done.summary.levelUp) setTimeout(() => sfx.levelUp(), 300);
  else if (done.summary.pounds > 0) setTimeout(() => sfx.coin(), 300);
  if (didSomething) {
    noteActivity();
    maybeAskAfterSession();
  }
}

function checkBadgesNow(hour) {
  return store.checkBadges(S, { hour });
}

let lastSummary = null;

function viewSummary() {
  const s = lastSummary;
  if (!s) return viewHome();
  const sum = s.summary;
  const day = store.getDay(S);
  const stat = (label, value) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`;
  return `<main class="page summary">
    <section class="sum-head">
      <div class="logo small">POUND<span class="gold-text">FIGHTER</span></div>
      <h1 class="${s.captured.length ? 'gold-text big-win' : ''}">${s.captured.length ? 'Victory!' : s.reps ? 'Good effort' : 'Session ended'}</h1>
      <p class="muted">${s.captured.length ? `${s.captured.length} monster${s.captured.length > 1 ? 's' : ''} captured. Your glutes thank you.` : 'Every rep counts. Come back in an hour for another punch.'}</p>
    </section>
    <section class="stats">
      ${stat('Reps', s.reps)}${stat('Time', fmtTime(sum.secs))}${stat('Best combo', `×${s.maxCombo}`)}
      ${stat('Earned', coin(sum.pounds))}${stat('XP', `+${sum.xp}`)}${stat('By voice', s.micReps)}
    </section>
    ${sum.levelUp ? `<section class="panel levelup"><div class="lvl-big">${sum.levelUp.level}</div><div><h2>Level up!</h2><p>You are now a <b>${esc(sum.levelUp.rank)}</b>.</p></div></section>` : ''}
    ${s.captured.length ? `<section class="panel">
      <div class="panel-head"><h2>Captured</h2></div>
      <div class="cards">
        ${s.captured.map((c) => {
          const m = D.MONSTER_BY_ID[c.id];
          return `<button class="mcard r-${m.rarity} t-${D.tierFor(S.caught[m.id]).id}" data-action="monster" data-id="${m.id}">
            ${c.isNew ? '<span class="new-tag">NEW</span>' : ''}
            <div class="mcard-art">${monsterSVG(m)}</div>
            <div class="mcard-name">${esc(m.name)}</div>
            <div class="mcard-rar">${rarityName(m.rarity)}${c.tierUp ? ` · ${c.tierUp}!` : ''}</div>
          </button>`;
        }).join('')}
      </div>
    </section>` : ''}
    ${sum.quests.length || sum.chests.length || sum.badges.length ? `<section class="panel">
      <div class="panel-head"><h2>Rewards</h2></div>
      <ul class="rewards">
        ${sum.quests.map((q) => `<li>${I.check}<span>Quest done: ${esc(q.text)}</span>${coin(q.reward)}</li>`).join('')}
        ${sum.chests.map((c) => `<li>${I.gift}<span>${esc(c.name)} opened${c.lure ? ' + Epic Lure' : ''}</span>${coin(c.pounds)}</li>`).join('')}
        ${sum.badges.map((b) => `<li>${I.medal}<span>Badge: <b>${esc(b.name)}</b>. ${esc(b.desc)}</span></li>`).join('')}
      </ul>
    </section>` : ''}
    <section class="panel">
      <div class="panel-head"><h2>Today's punch card</h2><span class="muted small">${day.punches.length}/${D.PUNCH_SLOTS}</span></div>
      ${punchCard(day)}
    </section>
    ${hasHost && online.status === 'ready' && !online.account ? `<section class="panel gold-panel save-nudge">
      <div class="acct-crest">${I.shield}</div>
      <div><b>Don't lose your monsters</b><span class="small">Create a free account to save your progress.</span></div>
      <button class="btn small gold" data-action="auth" data-mode="signup">Save</button>
    </section>` : ''}
    <div class="row-btns sticky">
      <button class="btn" data-action="go" data-to="home">Home</button>
      <button class="btn primary" data-action="start" data-pos="${s.pos}">Fight again</button>
    </div>
  </main>`;
}

// ---------- Events ----------

const actions = {
  go: (el) => go(el.dataset.to),
  start: (el) => startSession(el.dataset.pos),
  'set-length': (el) => {
    S.settings.length = Number(el.dataset.len);
    persist();
    render();
  },
  'toggle-mic': () => {
    if (!detector.supported) {
      toast('This browser can’t use the microphone. Tap to count reps instead.', 'warn');
      return;
    }
    S.settings.mic = !S.settings.mic;
    persist();
    render();
    if (S.settings.mic && !S.settings.micSetupDone) openMicTest();
  },
  'mic-test': () => openMicTest(),
  recalibrate: () => {
    detector.recalibrate();
    toast('Measuring the room… stay quiet');
  },
  toggle: (el) => {
    const k = el.dataset.key;
    S.settings[k] = !S.settings[k];
    applySettings();
    persist();
    render();
  },
  'close-modal': () => closeModal(),
  ctab: (el) => {
    collectionTab = el.dataset.h;
    render();
  },
  monster: (el) => showMonster(el.dataset.id),
  'buy-lure': (el) => {
    const l = D.LURES.find((x) => x.id === el.dataset.id);
    if (!store.spend(S, l.price)) return toast(`You need ${coin(l.price - store.pounds(S))} more. Go pound some reps!`, 'warn');
    store.addLure(S, l.id);
    if (!S.armedLure) S.armedLure = l.id;
    persist();
    sfx.coin();
    toast(`${esc(l.name)} bought${S.armedLure === l.id ? ' and armed' : ''}!`);
    render();
  },
  'arm-lure': (el) => {
    S.armedLure = S.armedLure === el.dataset.id ? null : el.dataset.id;
    persist();
    render();
  },
  arena: (el) => {
    const a = D.ARENAS.find((x) => x.id === el.dataset.id);
    if (!S.arenas.includes(a.id)) {
      if (!store.spend(S, a.price)) return toast(`You need ${coin(a.price - store.pounds(S))} more for ${esc(a.name)}.`, 'warn');
      S.arenas.push(a.id);
      sfx.coin();
      toast(`${esc(a.name)} unlocked!`);
    }
    S.arena = a.id;
    persist();
    render();
  },
  reset: () => openModal(`<div class="confirm"><h3>Reset all progress?</h3><p class="muted">Your monsters, pounds, badges and streak will be gone for good.</p>
    <div class="row-btns"><button class="btn" data-action="close-modal">Keep it</button><button class="btn danger" data-action="reset-yes">Reset</button></div></div>`),
  'hide-install': () => {
    store.deviceSet({ hideInstall: true });
    render();
  },
  'reset-yes': () => {
    S = store.resetAll();
    applySettings();
    closeModal();
    go('home');
    toast('Fresh start. Go get ’em.');
  },
  'skip-fight': () => escapeFight(),
  'next-fight': () => nextFight(),
  'end-session': () => {
    if (!session) return;
    if (!session.reps && !session.captured.length) {
      const f = cur();
      clearTimeout(f.readyTimer);
      clearInterval(f.autoTimer);
      clearInterval(session.ticker);
      detector.listening = false;
      detector.stop();
      keepAwake(false);
      session = null;
      return go('home');
    }
    openModal(`<div class="confirm"><h3>End the session?</h3><p class="muted">Everything you've done so far is saved. The current monster escapes.</p>
      <div class="row-btns"><button class="btn" data-action="close-modal">Keep fighting</button><button class="btn primary" data-action="end-yes">End session</button></div></div>`);
  },
  'end-yes': () => {
    closeModal();
    const f = cur();
    if (f && f.phase !== 'captured' && f.phase !== 'escaped') {
      session.escaped++;
      S.totals.escapes++;
    }
    finishSession();
  },
};

Object.assign(actions, onlineActions, reminderActions);

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) {
    e.preventDefault();
    fn(el);
  }
});

// Taps on the monster count as reps (pointerdown feels snappier than click)
document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('[data-tap]')) onRep('tap');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOpen()) return closeModal();
  if (route === 'fight' && session && (e.code === 'Space' || e.key === 'Enter') && !modalOpen()) {
    e.preventDefault();
    const f = cur();
    if (f.phase === 'fight') onRep('tap');
    else if (f.canAdvance) nextFight();
  }
});

document.addEventListener('input', (e) => {
  const k = e.target.dataset.setting;
  if (!k) return;
  if (k === 'sensitivity') {
    S.settings.sensitivity = 36 - Number(e.target.value); // slider right = more sensitive
    for (const id of ['sensVal', 'sensVal2']) if ($(id)) $(id).textContent = sensLabel(S.settings.sensitivity);
  } else if (k === 'minGap') {
    S.settings.minGap = Number(e.target.value);
    if ($('gapVal')) $('gapVal').textContent = `${(S.settings.minGap / 1000).toFixed(2)}s`;
  }
  applySettings();
  persist();
});

window.addEventListener('pagehide', saveLocal);

const ctx = {
  getS: () => S,
  setS: (next) => {
    S = next;
    applySettings();
  },
  saveLocal,
  save: persist,
  refresh,
  go,
  route: () => route,
  inFight: () => route === 'fight',
  contextInfo: () => ({
    route,
    ua: navigator.userAgent,
    screen: `${screen.width}x${screen.height}@${window.devicePixelRatio || 1}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    standalone: env.standalone,
    lang: navigator.language,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    mic: S.settings.mic,
    micSupported: detector.supported,
    level: store.levelInfo(S.xp).level,
    signedIn: !!online.account,
  }),
};

render();
initOnline(ctx);
initReminders(ctx);

// Handy for testing in the console
window.PF = { get state() { return S; }, detector, onRep };
