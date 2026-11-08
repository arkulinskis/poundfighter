"""The game engine (theme/assets/app/js/pf.js, window.PF) as Python: views, actions, monster art, account sync.

    pf.start()               once at start-up: waits for the engine module, sets its hooks (toasts, sync, fight end)
    pf.view("home")          the data a page draws (a dict); also "shop", "me", "summary", "collection", tab ...
    pf.act("buyLure", id)    a change to the game state: {"ok", "msg"?, ...}; toasts msg when it says so
    pf.art(monster_id)       the monster's SVG (Components/MonsterArt draws it)
    pf.sync_now()            merge this device's progress with the account (server: sync_progress); also on a timer
                             after every save while someone is signed in (pf.schedule_sync)
    pf.SYNC                  {"busy", "last" (ms), "error"} for the Me page's account panel

The game rules and the merge logic stay in JavaScript (store.js mirrors merge_progress in server_code); Python only
moves JSON between the engine and the server.
"""
import json

import anvil.js
import anvil.server
from anvil.js import window

from . import state

SYNC: dict = {"busy": False, "last": 0, "error": "", "queued": False, "timer": 0}


def engine():
    return window.PF


def start():
    anvil.js.await_promise(window.PFReady)
    h = window.PF.hooks
    h.toast = _toast
    h.saved = schedule_sync
    h.finished = _finished
    h.quit = _quit
    h.confirmEnd = _confirm_end


def set_route(name):
    engine().setRoute(name)


def view(name, *args):
    return json.loads(getattr(engine(), name)(*args))


def act(name, value=None, quiet=False):
    """A change to the game state. A refused change ({"ok": False, "msg"}) shows as a toast unless quiet."""
    r = json.loads(engine().act(name, value))
    if not quiet and r.get("msg"):
        state.toast(r["msg"], "ok" if r.get("ok") else "error")
    return r


def art(monster_id):
    return engine().art(monster_id)


def device():
    return json.loads(engine().device())


def device_set(**patch):
    return json.loads(engine().deviceSet(json.dumps(patch)))


def money(n):
    return "£{:,}".format(int(n or 0))


# ---------------------------------------------------------------- engine hooks
def _toast(message, kind=None):
    state.toast(message, "error" if kind in ("error", "warn") else kind)


def _finished(did_something):
    from . import reminders, router
    router.go("summary")
    if did_something:
        reminders.after_session()


def _quit():
    from . import router
    router.go("home")


def _confirm_end():
    from anvil import confirm
    return bool(confirm("Everything you've done so far is saved. The current monster escapes.", title="End the session?",
                        buttons=[("Keep fighting", False), ("End session", True)], role="app-dialog"))


# ---------------------------------------------------------------- account sync
def schedule_sync(delay=4000):
    """Called after every save: batch the changes into one sync a few seconds later (signed-in people only)."""
    if not state.me():
        return
    window.clearTimeout(SYNC["timer"])
    SYNC["timer"] = window.setTimeout(_sync_soon, delay)


def _sync_soon():
    sync_now()


def sync_now():
    me = state.me()
    if not me:
        return
    if SYNC["busy"]:
        SYNC["queued"] = True
        return
    window.clearTimeout(SYNC["timer"])
    SYNC["busy"] = True
    email = me.get("email") or ""
    try:
        out = json.loads(engine().syncOut(email))
        if out.get("switch"):
            # This device holds someone else's progress: switch to this account's copy
            remote = anvil.server.call_s("sync_progress", None)
            back = json.loads(engine().syncIn(json.dumps(remote) if remote else "", email, "switch"))
            if back.get("upload"):
                anvil.server.call_s("sync_progress", back.get("data"))
        else:
            merged = anvil.server.call_s("sync_progress", out.get("data"))
            engine().syncIn(json.dumps(merged) if merged else "", email, "merge")  # merge again: play went on meanwhile
        SYNC["last"] = window.Date.now()
        SYNC["error"] = ""
    except Exception as e:
        SYNC["error"] = str(e) or type(e).__name__
        if type(e).__name__ in ("PermissionDenied", "SessionExpiredError"):
            state.set_me(None)  # the session ended
    finally:
        SYNC["busy"] = False
    if SYNC["queued"]:
        SYNC["queued"] = False
        schedule_sync(1500)
    _refresh_quietly()


def _refresh_quietly():
    """Redraw the open page after a sync, but never mid-fight or while someone is typing."""
    from . import router
    if router.current() == "fight":
        return
    el = window.document.activeElement
    if el and str(el.tagName) in ("INPUT", "TEXTAREA", "SELECT"):
        router.refresh_bar()
        return
    router.refresh_page()


def signed_out():
    """After signing out the device starts fresh (the progress is safe in the account); settings stay."""
    window.clearTimeout(SYNC["timer"])
    SYNC.update(busy=False, last=0, error="", queued=False)
    engine().signedOut()
