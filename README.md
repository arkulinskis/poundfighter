# PoundFighter

**Brain off, glutes on.** Micro workouts for your workday, turned into a monster-collecting game.
Live at [poundfighter.com](https://poundfighter.com).

## How it plays

1. Say where you are: **in bed**, **at your desk** or **standing**. Pick a session length (1, 3 or 5 fights).
2. Each fight is one exercise against a hidden monster. Every rep damages it and uncovers part of its portrait.
3. **Voice reps:** grunt, clap or say "HUP!" on each rep. The mic learns the room's background noise and counts
   a rep whenever the sound jumps well above it. The screen stays awake during the session. No mic? Tap the monster
   or press space.
4. Beat it and it's **captured** into your collection. 36 monsters across three habitats
   (Bedroom, Office, Lounge), one habitat per position, in four rarities. Catch duplicates to level cards up to
   Bronze, Silver and Gold.

Around that loop:

- **Pounds (£)** for every rep, multiplied by combos. Spend them in the shop on **Lures** (better odds of
  rare monsters) and **Arenas** (fight backgrounds).
- **XP and ranks** from Couch Potato to PoundFighter Legend.
- **Daily punch card:** one punch per clock hour you fight in, with chests at 4 and 8 punches. Built to reward
  little-and-often across the workday.
- **Daily quests**, **day streaks**, **badges**, and optional **workday nudges** (browser notifications).

Progress is saved in the browser (localStorage). There are no accounts.

## Code layout

The game is a plain HTML/CSS/JavaScript app with no build step:

```
theme/assets/app/
  index.html
  styles.css
  js/app.js          screens, fight loop, rewards
  js/mic.js          microphone rep detector (baseline + peak with hysteresis)
  js/monster-art.js  procedural SVG monsters (generated from each monster's id)
  js/data.js         exercises, monsters, quests, badges, shop
  js/store.js        saved progress, levels, quests, streaks, badges
  js/sfx.js          synthesized sound effects + vibration
```

### Hosting

- **On Anvil (current setup):** the `Main` startup form shows the app full-screen from
  `/_/theme/app/index.html` in a same-site iframe (with microphone and screen-wake-lock allowed).
  After pulling this branch into the Anvil editor, publish as usual.
- **Anywhere else:** `theme/assets/app/` is a self-contained static site. Serve it over HTTPS (needed for the
  microphone), e.g. GitHub Pages or Netlify.

### Run locally

```
cd theme/assets/app
python -m http.server 8000
# open http://localhost:8000  (localhost counts as secure, so the mic works)
```

### Tuning the mic

In **Me → Tune the mic** you can watch the live level against the rep line. *Sensitivity* sets how far above
the background noise a sound must be (6–30 dB, default 14). *Minimum time between reps* (default 0.45 s)
stops one grunt from counting twice.

The old Anvil forms (`flipdown_anvil`, `Form1`, `Form2`, `flipdown_javaxcript`) are still in `client_code/` but
are no longer used.
