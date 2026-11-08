"""Move reminders (push notifications during the player's chosen hours) and installing PoundFighter as an app.

Push: the engine (pf.js `PF.push`) registers the service worker (theme/assets/app/sw.js, scope _/theme/app/, the
same address as before, so old subscriptions keep working) and subscribes; this module makes the server calls
(push_public_key, push_subscribe, push_update, push_unsubscribe, push_activity, push_test). Where push isn't
available, reminders run "locally": the engine shows a notification while the app is open.
Device-only state (never synced): pf.device() = {reminders: "push" | "local" | None, pushEndpoint, askedReminders,
hideInstall}.
"""
import json

import anvil.js
import anvil.server
from anvil import alert
from anvil.js import window

from . import pf, state

_r: dict = {"prefs_timer": 0, "listening": False}


def env():
    return json.loads(pf.engine().push.env())


def is_on():
    return bool(pf.device().get("reminders"))


def can_install():
    e = env()
    return not e.get("standalone") and (e.get("installable") or e.get("ios"))


def _prefs():
    return json.loads(pf.engine().push.prefs())


def _tz():
    return window.Date().getTimezoneOffset()


def start():
    """At start-up: keep the server's copy of this device's timezone and hours fresh; listen for "install" events."""
    if not _r["listening"]:
        window.addEventListener("pf-install", anvil.js.report_exceptions(_on_install_event))
        _r["listening"] = True
    d = pf.device()
    if d.get("reminders") == "push" and d.get("pushEndpoint"):
        if pf.engine().push.check():
            try:
                anvil.server.call_s("push_update", d["pushEndpoint"], _prefs(), _tz())
            except Exception:
                pass
        else:
            pf.device_set(reminders=None, pushEndpoint=None)


def _on_install_event(event):
    from . import router
    if event.detail == "installed":
        state.toast("PoundFighter installed!", "ok")
    router.refresh_page()


def schedule_text():
    return pf.engine().scheduleText()


def enable():
    """Turn reminders on: push where the browser can, else local reminders while the app is open."""
    from . import router
    e = env()
    if e.get("ios") and not e.get("standalone"):
        ios_install()
        return False
    if not e.get("notifications"):
        state.toast("This browser can’t show notifications.", "error")
        return False
    perm = pf.engine().push.permission()
    if perm != "granted":
        state.toast("Notifications are blocked. Allow them for poundfighter.com in your browser settings.", "error")
        return False
    if e.get("push"):
        try:
            key = anvil.server.call("push_public_key")
            sub = pf.engine().push.subscribe(key)
            if sub:
                sub = json.loads(sub)
                anvil.server.call("push_subscribe", sub, _prefs(), _tz())
                pf.device_set(reminders="push", pushEndpoint=sub.get("endpoint"), askedReminders=True)
                state.toast("Reminders on. " + schedule_text(), "ok")
                router.refresh_page()
                return True
        except Exception as err:
            print("Push setup failed, using local reminders:", err)
    pf.device_set(reminders="local", askedReminders=True)
    state.toast("Reminders on while PoundFighter is open. " + schedule_text(), "ok")
    router.refresh_page()
    return True


def disable():
    from . import router
    d = pf.device()
    if d.get("reminders") == "push":
        pf.engine().push.unsubscribe()
        if d.get("pushEndpoint"):
            try:
                anvil.server.call_s("push_unsubscribe", d["pushEndpoint"])
            except Exception:
                pass
    pf.device_set(reminders=None, pushEndpoint=None)
    state.toast("Reminders off.")
    router.refresh_page()


def prefs_changed():
    """The hours or the weekday switch changed: tell the server a moment later (several quick changes = one call)."""
    window.clearTimeout(_r["prefs_timer"])
    _r["prefs_timer"] = window.setTimeout(_push_prefs, 800)


def _push_prefs():
    d = pf.device()
    if d.get("reminders") == "push" and d.get("pushEndpoint"):
        try:
            anvil.server.call_s("push_update", d["pushEndpoint"], _prefs(), _tz())
        except Exception:
            pass


def send_test():
    try:
        anvil.server.call("push_test", pf.device().get("pushEndpoint"))
        state.toast("Sent! It should pop up in a few seconds.", "ok")
    except Exception as e:
        state.toast(str(e), "error")


def note_activity():
    """After a workout, push the next reminder back."""
    d = pf.device()
    if d.get("reminders") == "push" and d.get("pushEndpoint"):
        try:
            anvil.server.call_s("push_activity", d["pushEndpoint"])
        except Exception:
            pass


def after_session():
    note_activity()
    d = pf.device()
    if d.get("askedReminders") or d.get("reminders"):
        return
    pf.device_set(askedReminders=True)
    window.setTimeout(_ask, 900)


def _ask():
    from .Dialogs.AskRemind import AskRemind
    e = env()
    needs_install = bool(e.get("ios") and not e.get("standalone"))
    choice = alert(AskRemind(schedule=schedule_text(), needs_install=needs_install, can_install=bool(can_install())),
                   buttons=[], role="app-dialog")
    if choice == "yes":
        enable()
    elif choice == "install":
        install()


def install():
    """The browser's own "Install app" prompt (captured in head_html), or the steps for iPhone and iPad."""
    from . import router
    if env().get("ios"):
        ios_install()
        return
    try:
        outcome = window.pfInstall()
        if outcome == "accepted":
            state.toast("Installing PoundFighter…", "ok")
        elif outcome == "unavailable":
            state.toast("Use your browser menu and choose “Install app” or “Add to Home screen”.")
    except Exception:
        state.toast("Use your browser menu and choose “Install app” or “Add to Home screen”.")
    router.refresh_page()


def ios_install():
    from .Dialogs.IosInstall import IosInstall
    alert(IosInstall(), buttons=[], role="app-dialog")
