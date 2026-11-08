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
- **Feedback:** "Submit feedback" opens Prepsto (the app's only feedback channel). Admins still see the older
  in-app messages in a **Feedback inbox** in *Me* (status New / Reviewing / Fixed / Won't fix, private notes).
- **Move reminders:** push notifications during the player's chosen hours (default weekdays 9–5, every 60 min),
  pushed back automatically after each workout. The app offers to install itself (home screen / desktop), and on
  iPhone shows how to add it to the Home Screen, which iOS requires for notifications. Asked once after the first fight.

## Code layout

PoundFighter is a native Anvil Forms app (Python Forms with HTML templates, one layout, custom components,
RepeatingPanels). The game engine stays JavaScript: an ES module in `theme/assets/app/js`, wrapped by a Python
module and two custom components. `APP_MAP.md` is the full code map.

```
client_code/
  startup.py         who is signed in, Privacy & Terms, the engine, then the page for the address
  router.py          #home #collection/<habitat> #shop #me #fight/<bed|sitting|standing> #summary #admin
  pf.py              the engine as Python: views (PF.home() ...), actions (PF.act), monster art, account sync
  reminders.py       move reminders (push or in-app) and installing the app
  auth.py, state.py, legal.py
  Layouts/Shell      top bar (level, rank, XP, streak, pounds), footer links, tab bar
  Pages/             Home, Collection, Shop, Me, Fight, Summary, Admin (feedback inbox)
  Components/        Arena (the engine's fight screen), MonsterArt (a monster's SVG portrait)
  Items/             tab, session length, places, punch card, quests, sightings, cards, lures, arenas, stats,
                     badges, rewards, feedback rows
  Dialogs/           Monster, Auth, ChangePassword, MicTest, AskRemind, IosInstall
theme/assets/
  app.css, app-kit.js, icons.css (tools/build_icons.py), theme.css (loading spinner)
  app/js/pf.js       the engine API (window.PF): fight loop, rewards, views and actions for the pages
  app/js/data.js     exercises, monsters, quests, badges, shop        app/js/store.js   saved progress + merge rules
  app/js/mic.js      microphone rep detector                         app/js/monster-art.js  procedural SVG monsters
  app/js/sfx.js      synthesized sounds + vibration                   app/js/ui.js      small helpers for the engine
  app/js/ark-music.js  the music player (copy from APP_MAKER/media)
  app/sw.js          service worker that shows reminder notifications (kept at its old address: subscriptions survive)
server_code/ServerModule.py  accounts, progress sync, feedback inbox, reminder scheduling
server_code/push.py      Web Push sender (encryption + VAPID signing; packages in server_code/requirements.txt)
anvil.yaml               data tables: progress, feedback, push_subscriptions, app_settings; users.is_admin
tools/                   check.py (validator + server tests), ui_test.py + ui/smoke.js (the real app in Docker)
```

### One-time setup after pulling into Anvil

1. **Make yourself admin:** sign up in the app, then in *Data Tables → Users* tick `is_admin` on your row.
   Sign in again: *Me* now shows **Feedback inbox**.
2. **Turn on reminders sending:** in the editor open *Scheduled Tasks*, add `send_reminders`, every 15 minutes.
   (The VAPID key pair for push is created automatically on first use and stored in `app_settings`.)
3. Users service: sign-up is on, email confirmation off, "remember me" for a year. Password-reset emails are sent
   by Anvil's Users service.

### Check and test

```
python tools/check.py            # Anvil's validator, JavaScript, asset hashes, server tests -> ALL CHECKS PASSED
python -I tools/ui_test.py       # every page in the local Anvil App Server (Docker), guest / member / admin
```

### Tuning the mic

In **Me → Tune the mic** you can watch the live level against the rep line. *Sensitivity* sets how far above
the background noise a sound must be (6–30 dB, default 14). *Minimum time between reps* (default 0.45 s)
stops one grunt from counting twice.

<!-- libraries:start -->
## Libraries and outside services

What this project uses besides its own code. Generated by `APP_MAKER/tools/libraries.py`; to change it, edit `APP_MAKER/libraries/catalog.py` and re-run the script.

| Name | How it gets in | Used here for |
|---|---|---|
| [Arkvital music library (ArkMusic)](https://arkvital-media.web.app) | Outside web service | menu, fight (only without voice reps) and summary music |
| [YouTube embeds](https://developers.google.com/youtube/player_parameters) | Outside web service | Plays a YouTube video inside the page (the privacy-friendlier youtube-nocookie address). |
| [Google Fonts](https://fonts.google.com) | Loaded from a CDN | Bungee, Rubik |
| [Requests](https://requests.readthedocs.io) | Python package | delivers push notifications |
| [bcrypt](https://pypi.org/project/bcrypt/) | Python package | password changes |
| [cryptography](https://cryptography.io) | Python package | signs and encrypts push notifications (VAPID) |

**Built into the browser:** Web Audio API, Camera, microphone and screen, Screen Wake Lock, Vibration, Service worker and push notifications (workout reminders as push notifications), localStorage.

**Anvil platform:** Anvil, Anvil Data Tables, Anvil Google service, Anvil JS bridge (anvil.js), Anvil Users, Material 3 Theme (the app's buttons, cards and colours).

<!-- libraries:end -->
