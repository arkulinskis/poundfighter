---
name: poundfighter
description: Context, workflow and recipes for PoundFighter (poundfighter.com, folder poundfighter-forms), the user's Anvil micro-workout game ("brain off, glutes on") built as native Anvil Forms (Python + HTML templates, a layout, custom components, RepeatingPanels) around a JavaScript game engine. Short fights against hidden monsters where voice or taps count reps, 36 collectable monsters, pounds, shop, punch card, quests, accounts with progress sync, feedback inbox and push reminders. Load this before any feature request, bug fix, restyle or deploy for PoundFighter.
---

# PoundFighter: working on the app

**What it is:** micro workouts for the workday turned into a monster-collecting game. Pick where you are (in bed, at
your desk, standing) and a session (1, 3 or 5 fights); each fight is one exercise against a hidden monster; every rep
damages it and uncovers its portrait. **Voice reps**: the mic learns the room's noise and counts a rep on each loud
peak (grunt, clap, "HUP!"); the screen stays awake; no mic -> tap or space. 36 monsters in 3 habitats and 4 rarities,
duplicates level cards (Bronze/Silver/Gold). Pounds (£) with combos, shop (Lures, Arenas), XP and ranks, daily punch
card (one punch per clock hour), quests, streaks, badges. Optional accounts with progress sync (merged, never
overwritten), an admin feedback inbox (new feedback goes to Prepsto), push "move reminders" during chosen hours,
install prompt.

**Where it lives:**
- Folder `C:\Users\arkvi\Documents\CLAUDE\poundfighter-forms\` = the git clone of
  **github.com/arkulinskis/poundfighter**, branch `master`. "git" layout: the folder *is* the Anvil app. **Anvil
  publishes `master`** (GitHub's default branch `dev0` is old: ignore it). Pushing is the deploy.
  Live: **https://poundfighter.com**.
- Native Forms since 2026-11-08 (forms branch merged that day). The old folder `..\poundfighter` (the iframe version)
  is retired (RETIRED.md): an old clone, never commit or push from it.
- Made like `APP_MAKER\template-forms`; its guide has the general Forms patterns, accessibility and design-kit rules.
- **README.md** lists every feature. **APP_MAP.md** is the code map: read it first, regenerate after changes
  (`python -I C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/standard/app_map.py poundfighter`).

**What the user wants:** engaging and gamified, with lots to collect; get people moving and healthy; shiny gold
elements. **Dark only** (the game was never light). Claude assumes and builds; Claude deploys. Every page fits 390 px.

## Workflow for any change

1. `git pull --ff-only` on master (Anvil commits "Edited ..." when the user changes something in the IDE).
2. Edit a page's template and Python side by side (`client_code/Pages/X/`), or the engine in `theme/assets/app/js/`.
3. `python tools/check.py` (no -I) -> **ALL CHECKS PASSED**: `anvil validate`, JS syntax, asset hashes
   (`tools/assets.py`), server tests.
4. `python -I tools/ui_test.py` (Docker Desktop running) -> the smoke test (tools/ui/smoke.js: guest incl. a real
   fight, member sign-up + sync, admin; `tools/ui/promote.py` makes the smoke admin an admin over Uplink, needs
   `pip install --user anvil-uplink`). Server edits need `--restart`; `--stop` at the end.
5. Commit as arkulinskis with the Co-Authored-By line; `git push origin master`. New tables/columns: tell the user to
   accept the **Schema Mismatch** alert ("The schema of the source code is correct"). Regenerate APP_MAP.md.

## Architecture

```
client_code/
  startup.py     pf.start() (waits for window.PFReady), then the router
  router.py, state.py, auth.py, legal.py   as template-forms (legal.py = the kit: don't edit)
  pf.py          Python <-> engine: pf.view("home" | "shop" | "me" | "summary" | "collection", tab | "monster", id |
                 "chrome") = plain JSON views; pf.act(name, value) = the only way to change things (ACTIONS in pf.js);
                 hooks the engine calls: finished, quit, confirmEnd, toast, saved; pf.sync_now()
  reminders.py   push reminder server calls (PF.push does the browser part)
  Layouts/Shell  header, footer (4 links), phone tab bar
  Pages/         Home, Collection, Shop, Me (account, settings, reminders), Fight, Summary, Admin (feedback inbox)
  Components/    Arena (the fight screen), MonsterArt
  Dialogs/       Auth, ChangePassword, MicTest, Monster, AskRemind, IosInstall
server_code/     ServerModule.py (get_account, change_password, sync_progress + merge_progress, feedback admin,
                 push_* + scheduled reminders), push.py (Web Push, RFC 8291 + VAPID), requirements.txt (cryptography,
                 bcrypt, requests; runtime python314), SchemaCheck, legal_server, seo_routes
theme/assets/app/js/  pf.js (ES module: game state + rules, window.PF, ACTIONS; imports the rest), data.js (exercises,
                 monsters, quests, badges, shop), store.js (saved progress, levels, quests, streaks, mergeStates),
                 mic.js (rep detector: baseline + peak with hysteresis), monster-art.js (procedural SVG monsters),
                 sfx.js (synth sounds + vibration), ui.js (icons, gold coin), ark-music.js (shared player, generated)
theme/assets/app/sw.js  service worker for notifications (scope _/theme/app/: keeps old subscriptions working)
```

**Tables:** `users` (+ is_admin, legal_*), `progress` (user -> data simpleObject), `feedback` (status New / Reviewing /
Fixed / Won't fix, admin_note), `push_subscriptions`, `app_settings`.

## How things are done here

- Pages, lists, dialogs, buttons: the template-forms patterns (its guide).
- **New game feature** = data.js/store.js + a view field + an action in pf.js, then the Form that shows it.
- **Fight screen** = Components/Arena: on the Fight page's show it calls `PF.fightStart(el, pos)` (not awaited: the
  mic may ask for permission); the engine draws by element id (`$('stage')`), so only one fight at a time.
- **Sync:** `pf.sync_now()` moves JSON between `PF.syncOut/syncIn` and `sync_progress`. Merge rules in store.js
  `mergeStates` and server `merge_progress` must stay identical (counters only go up; pounds are earned and spent totals).
- **Mic tuning** = Dialogs/MicTest; the meter elements keep the engine's ids (tLvl, tBase, tThr, tCount).
- **Install prompt:** head_html captures `beforeinstallprompt` and fires a `pf-install` window event.
- Engine icons are inline `<svg class="ic">`: app.css turns icons.css's mask off for `svg.ic`.

## Recipes

- **New monster / exercise / quest / badge / shop item:** data.js (+ art in monster-art.js if needed); keep merging
  safe in store.js and `merge_progress`.
- **New server call:** a callable in ServerModule.py (check `anvil.users.get_user()` and admin where needed), called
  from Python with `state.call(...)` (not from the engine).
- **New page:** template-forms recipe; add the address to tools/ui/smoke.js.

## Gotchas

- push.py imports cryptography etc. inside try/except so a missing package only breaks reminders (the local App
  Server has no cryptography). Test reminders and Change password on hosted Anvil.
- iOS only allows notifications for apps added to the Home Screen (Dialogs/IosInstall explains this).
- The mic needs a user gesture and HTTPS; the screen wake lock likewise.
- Continue with Google: `login_with_google()` returns None for someone without an account, so the code then calls
  `signup_with_google()`; on sign-up it needs the Privacy & Terms tick first.
- anvil.yaml `metadata` may still have a stray key `glutes on: null`: harmless; tidy it when next editing metadata.
- Never write Anvil's theme-colour token pattern (percent, `color:`, name, percent) in theme.css.

## Music

`syncMusic()` in the engine picks by route; it must never play while the mic counts reps or the mic test is open
(session.mic / micTest). Setting `S.settings.music`. Player = `window.ArkMusic` in theme/assets/app/js/ark-music.js,
written by `APP_MAKER/tools/music_sync.py`: edit `APP_MAKER/media/public/ark-music.js` and re-sync, never the copy.

## Privacy & Terms (legal kit)

From `C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/legal-kit` (`apps/poundfighter.json`, lists the microphone and
notifications): `python -I build.py poundfighter && python -I install.py poundfighter` there (writes
theme/assets/legal-kit.js, client_code/legal.py, server_code/legal_server.py, the head_html tag), then
`python tools/assets.py`, commit and push here. Sign-up keeps the consent tick (Dialogs/Auth). Feedback = Prepsto only
("Submit feedback").
