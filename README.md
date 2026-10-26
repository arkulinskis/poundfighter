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

- **Accounts (optional):** sign up / sign in / forgot password / change password. Progress is saved in the browser
  and, when signed in, synced to the account. Copies from different devices are merged, never overwritten
  (counters only go up; pounds are tracked as earned and spent totals so a purchase can't be undone by a merge).
- **Feedback:** anyone can report a bug or idea (with optional device info). Admins see a **Feedback inbox** in
  *Me* to review messages, set a status (New / Reviewing / Fixed / Won't fix) and keep private notes.
- **Move reminders:** push notifications during the player's chosen hours (default weekdays 9–5, every 60 min),
  pushed back automatically after each workout. The app offers to install itself (home screen / desktop), and on
  iPhone shows how to add it to the Home Screen, which iOS requires for notifications. Asked once after the first fight.

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
  js/ui.js           shared helpers: icons, gold coin, toasts, dialogs
  js/bridge.js       postMessage link to the Anvil host page
  js/online.js       accounts, progress sync, feedback form, admin inbox
  js/reminders.js    install prompt, push reminders (with in-app fallback)
  sw.js              service worker that shows reminder notifications
```

### Server side (Anvil)

```
client_code/Main/        full-screen iframe + message bridge (game <-> Anvil users/server calls)
server_code/ServerModule.py  accounts, progress sync, feedback inbox, reminder scheduling
server_code/push.py      Web Push sender (encryption + VAPID signing, no extra packages)
anvil.yaml               data tables: progress, feedback, push_subscriptions, app_settings; users.is_admin
```

### One-time setup after pulling into Anvil

1. **Apply the data table changes** when Anvil asks (new tables and two new columns on Users).
2. **Make yourself admin:** sign up in the app, then in *Data Tables → Users* tick `is_admin` on your row.
   Reload the app: *Me* now shows **Feedback inbox**.
3. **Turn on reminders sending:** in the editor open *Scheduled Tasks*, add `send_reminders`, every 15 minutes.
   (The VAPID key pair for push is created automatically on first use and stored in `app_settings`.)
4. Users service: sign-up is on, email confirmation off, "remember me" for a year. Password-reset emails are sent
   by Anvil's Users service.

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

