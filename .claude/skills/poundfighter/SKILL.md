---
name: poundfighter
description: Context, workflow and recipes for PoundFighter (poundfighter.com), the user's Anvil micro-workout game ("brain off, glutes on"): short fights against hidden monsters where voice or taps count reps, 36 collectable monsters, pounds, shop, punch card, quests, accounts with progress sync, feedback inbox and push reminders. Load this before any feature request, bug fix, restyle or deploy for PoundFighter.
---

# PoundFighter: working on the app

**What it is:** micro workouts for the workday turned into a monster-collecting game. Pick where you are (in bed, at your desk, standing) and a session (1, 3 or 5 fights); each fight is one exercise against a hidden monster; every rep damages it and uncovers its portrait. **Voice reps**: the mic learns the room's noise and counts a rep on each loud peak (grunt, clap, "HUP!"); the screen stays awake; no mic → tap or space. 36 monsters in 3 habitats and 4 rarities, duplicates level cards (Bronze/Silver/Gold). Pounds (£) with combos, shop (Lures, Arenas), XP and ranks, daily punch card (one punch per clock hour), quests, streaks, badges. Optional accounts with progress sync (merged, never overwritten), a feedback form with an admin inbox, push "move reminders" during chosen hours, install prompt.

**Where it lives:**
- App repo **github.com/arkulinskis/poundfighter**. **Anvil publishes `master`** (the user confirmed on 2026-10-26; GitHub's default branch `dev0` is old, ignore it). Live: **https://poundfighter.com**.
- This folder **is** the Anvil repo ("git" layout). README.md describes the game and code layout.
- **Unmerged branch:** the local branch `v3.1-themed-loader` holds "Use the app icon as the loading spinner" (anvil.yaml head, app/index.html, app/styles.css), which is **not on master**. Work on master (`git checkout master && git pull --ff-only`) and leave that branch alone unless the user asks to merge it.

**What the user wants:** engaging and gamified, with lots to collect; get people moving and healthy; shiny gold elements. Claude assumes and builds; Claude deploys.

## Workflow

1. `python -I C:\Users\arkvi\Documents\CLAUDE\APP_MAKER\tools\apps_status.py poundfighter -v`; get onto an up-to-date `master` (see above); never touch someone else's uncommitted work.
2. Edit the files here.
3. `python C:\Users\arkvi\Documents\CLAUDE\APP_MAKER\tools\gitapp_check.py poundfighter` → `ALL CHECKS PASSED` (checks the ES modules in theme/assets/app/js too).
4. **See the game locally**: it runs without Anvil (online features off). Serve `theme/assets` (not `app/`, so `../` paths resolve), e.g. `python -m http.server 8772 --bind 127.0.0.1` from `theme/assets` in the background, then screenshot `http://127.0.0.1:8772/app/index.html` with `C:\Users\arkvi\Documents\CLAUDE\APP_MAKER\template\tools\live\drive.mjs` (WINDOW=390,844 for a phone). Stop the server afterwards.
5. Server logic: `python ...\APP_MAKER\tools\gitapp_test.py poundfighter <script>`. `push.py` imports `cryptography`, which this PC doesn't have: test ServerModule functions that don't need it, or ask the user before installing it.
6. Commit only your files as arkulinskis with the Co-Authored-By line; `git push origin master`.
7. Schema changes: `anvil.yaml → db_schema`; the user accepts the Schema Mismatch alert.

## Architecture

```
theme/assets/app/        the game: plain HTML/CSS/JS ES modules, no build step, running in a full-screen iframe
  index.html, styles.css
  js/app.js              screens, fight loop, rewards           js/data.js       exercises, monsters, quests, badges, shop
  js/store.js            saved progress, levels, quests, streaks, badges (localStorage; synced when signed in)
  js/mic.js              rep detector (baseline + peak with hysteresis)    js/monster-art.js  procedural SVG monsters from each id
  js/sfx.js              synthesized sounds + vibration         js/ui.js         icons, gold coin, toasts, dialogs
  js/bridge.js           postMessage link to the Anvil host page: call(method, args) -> Promise
  js/online.js           accounts, progress sync, feedback form, admin inbox, legal-kit hooks
  js/reminders.js        install prompt, push reminders (in-app fallback)   sw.js  service worker for notifications
client_code/Main/        hosts the iframe and answers bridge messages: m_hello, m_login, m_signup, m_logout, m_forgot,
                         m_change_password, m_legal_open, m_install, m_call(name, args) -> anvil.server.call(name, *args)
                         for the names in its `allowed` set only
server_code/ServerModule.py  get_account, change_password, sync_progress (merge rules), submit_feedback, admin_list/update/delete_feedback,
                         push_public_key, push_subscribe, push_update, push_unsubscribe, push_activity, push_test (+ scheduled reminders)
server_code/push.py      Web Push (VAPID) sending
```

**Tables:** `users` (+ is_admin, legal_*), `progress` (user → data simpleObject), `feedback` (status New / Reviewing / Fixed / Won't fix, admin_note), `push_subscriptions`, `app_settings`.

## Recipes

- **New monster / exercise / quest / badge / shop item:** `js/data.js` (+ art in monster-art.js if needed); keep progress merging safe in store.js and `sync_progress` (counters only go up; pounds are earned and spent totals).
- **New server call from the game:** add the callable to ServerModule.py (check `anvil.users.get_user()` and admin where needed), **add its name to the `allowed` set in `Main.m_call`** (the host only forwards whitelisted names), and call it from JS with `server('name', arg1, arg2)` (online.js).
- **New host-side action** (needs Anvil client APIs): a `m_<name>` method in client_code/Main and `call('<name>', {...})` in JS.

## Gotchas

- anvil.yaml `metadata` has a stray key `glutes on: null` (left over from an old title edit). Harmless; tidy it when next editing metadata.
- iOS only allows notifications for apps added to the Home Screen; the app explains this.
- The mic needs a user gesture and HTTPS; the screen wake lock likewise.

## Privacy & Terms (legal kit)

From `C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/legal-kit`. Don't edit `theme/assets/legal-kit.js`, `client_code/legal.py` or `server_code/legal_server.py` here: change `apps/poundfighter.json` there (it lists the microphone and notifications), run `python -I build.py poundfighter && python -I install.py poundfighter`, then commit and push here.
- Sign-up in js/online.js keeps the consent tick box.
