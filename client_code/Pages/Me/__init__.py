from anvil import *
import anvil.js
from anvil.js import window

from ._anvil_designer import MeTemplate
from ... import auth, pf, reminders, router, state


def _hour(h):
    return "12am" if h in (0, 24) else "12pm" if h == 12 else ("%dam" % h if h < 12 else "%dpm" % (h - 12))


START_HOURS = [(_hour(h), h) for h in range(5, 23)]
END_HOURS = [(_hour(h), h) for h in range(6, 25)]
EVERY = [("%d min" % n, n) for n in (30, 45, 60, 90, 120)]


def _ago(ms):
    s = (window.Date.now() - ms) / 1000
    if s < 45:
        return "just now"
    if s < 3600:
        return "%d min ago" % round(s / 60)
    if s < 86400:
        return "%d h ago" % round(s / 3600)
    return "%d d ago" % round(s / 86400)


class Me(MeTemplate):
    """#me: level and rank, the account (sign in / create account, or email + sync status + change password + sign
    out, and the Feedback inbox link for admins), lifetime stats, move reminders, badges and settings (voice reps,
    mic tuning, sensitivity, rep gap, sound, music, vibration, feedback, reset)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.start_box.items = START_HOURS
        self.end_box.items = END_HOURS
        self.every_box.items = EVERY
        for box, name in ((self.start_box, "Reminders from"), (self.end_box, "Reminders until"), (self.every_box, "Remind me every")):
            state.set_control_attr(box, "aria-label", name)
        self.dom_nodes["sens"].addEventListener("input", self._sens)
        self.dom_nodes["gap"].addEventListener("input", self._gap)
        self.redraw()

    # ---------------------------------------------------------------- drawing
    def redraw(self):
        d = pf.view("me")
        me = state.me()
        self.dom_nodes["level"].textContent = str(d["level"])
        self.dom_nodes["rank"].textContent = d["rank"]
        self.dom_nodes["xp_fill"].style.transform = "scaleX(%.3f)" % d["pct"]
        self.dom_nodes["xp_text"].textContent = d["xpText"]
        self.guest_panel.visible = not me
        self.member_panel.visible = bool(me)
        if me:
            self.dom_nodes["email"].textContent = me.get("email") or ""
            self.admin_tag.visible = bool(me.get("is_admin"))
            self.inbox_link.visible = bool(me.get("is_admin"))
            self._draw_sync()
        self.stats_panel.items = d["stats"]
        self.badges_panel.items = d["badges"]
        self.dom_nodes["badge_count"].textContent = "%d/%d" % (d["badgeCount"], d["badgeTotal"])
        self._draw_reminders(d)
        st = d["settings"]
        for sw, on in ((self.mic_switch, st["mic"]), (self.sound_switch, st["sound"]), (self.music_switch, st["music"]),
                       (self.vibrate_switch, st["vibrate"])):
            self._switch(sw, on)
        self.dom_nodes["sens"].value = st["sensitivity"]
        self.dom_nodes["sens_label"].textContent = st["sensLabel"]
        self.dom_nodes["gap"].value = st["minGap"]
        self.dom_nodes["gap_label"].textContent = st["gapLabel"]
        self.reset_row.visible = not me
        self.dom_nodes["version"].textContent = "PoundFighter v" + d["version"]

    def _switch(self, sw, on):
        sw.classes["on"] = bool(on)
        state.set_attr(sw, "aria-checked", "true" if on else "false")

    def _draw_sync(self):
        s = pf.SYNC
        self.retry_button.visible = bool(s["error"]) and not s["busy"]
        self.sync_icon.classes.update({"ic-cloud": s["busy"] or not s["last"], "ic-cloudcheck": bool(s["last"]) and not s["busy"]})
        if s["busy"]:
            text = "Saving…"
        elif s["error"]:
            text = "Not saved: " + s["error"]
        elif s["last"]:
            text = "Saved to your account " + _ago(s["last"])
        else:
            text = "Ready"
        self.dom_nodes["sync_text"].textContent = text

    def _draw_reminders(self, d):
        dev = pf.device()
        env = reminders.env()
        on = bool(dev.get("reminders"))
        p = d["reminders"]
        self.install_row.visible = bool(reminders.can_install())
        self.dom_nodes["install_hint"].textContent = ("Needed for reminders on iPhone." if env.get("ios")
                                                      else "One tap to open, and reminders that arrive even when it is closed.")
        self.installed_note.visible = bool(env.get("standalone"))
        self._switch(self.rem_switch, on)
        self.dom_nodes["rem_status"].textContent = ("Off" if not on else ("On. " if dev.get("reminders") == "push"
                                                    else "On while PoundFighter is open. ") + d["scheduleText"])
        self.rem_grid.classes["dim"] = not on
        self.start_box.selected_value = p.get("start", 9)
        self.end_box.selected_value = p.get("end", 17)
        self.every_box.selected_value = p.get("every", 60)
        self._switch(self.weekdays_switch, p.get("weekdays"))
        self.test_push_button.visible = dev.get("reminders") == "push"

    # ---------------------------------------------------------------- account
    def _auth(self, mode):
        from ...Dialogs.Auth import Auth
        if alert(Auth(mode=mode), buttons=[], role="app-dialog", dismissible=True):
            router.refresh_page()

    @handle("sign_in_button", "click")
    def sign_in_button_click(self, **event_args):
        self._auth("signin")

    @handle("sign_up_button", "click")
    def sign_up_button_click(self, **event_args):
        self._auth("signup")

    @handle("retry_button", "click")
    def retry_button_click(self, **event_args):
        pf.sync_now()

    @handle("password_button", "click")
    def password_button_click(self, **event_args):
        from ...Dialogs.ChangePassword import ChangePassword
        alert(ChangePassword(), buttons=[], role="app-dialog", dismissible=True)

    @handle("sign_out_button", "click")
    def sign_out_button_click(self, **event_args):
        if confirm("Your progress is saved in your account. This device will start fresh until you sign in again.",
                   title="Sign out?", buttons=[("Stay signed in", False), ("Sign out", True)], role="app-dialog"):
            auth.sign_out()
            state.toast("Signed out. Your progress is safe in your account.")
            router.refresh_page()

    # ---------------------------------------------------------------- reminders
    def rem_click(self, event):
        if reminders.is_on():
            reminders.disable()
        else:
            reminders.enable()
        self.redraw()

    def weekdays_click(self, event):
        pf.act("remWeekdays")
        reminders.prefs_changed()
        self.redraw()

    def _rem_pref(self, key, box):
        pf.act("remPref", "%s=%s" % (key, box.selected_value))
        reminders.prefs_changed()
        self.redraw()

    @handle("start_box", "change")
    def start_box_change(self, **event_args):
        self._rem_pref("start", self.start_box)

    @handle("end_box", "change")
    def end_box_change(self, **event_args):
        self._rem_pref("end", self.end_box)

    @handle("every_box", "change")
    def every_box_change(self, **event_args):
        self._rem_pref("every", self.every_box)

    @handle("install_button", "click")
    def install_button_click(self, **event_args):
        reminders.install()

    @handle("test_push_button", "click")
    def test_push_button_click(self, **event_args):
        reminders.send_test()

    # ---------------------------------------------------------------- settings
    def mic_click(self, event):
        r = pf.act("mic")
        self.redraw()
        if r.get("tune"):
            self._tune()

    @handle("tune_button", "click")
    def tune_button_click(self, **event_args):
        self._tune()

    def _tune(self):
        from ...Dialogs.MicTest import MicTest
        alert(MicTest(), buttons=[], role="app-dialog", dismissible=True)
        self.redraw()

    def toggle_click(self, event):
        el = event.currentTarget
        pf.act("toggle", el.getAttribute("data-key"))
        self.redraw()

    def _sens(self, event):
        r = pf.act("sensitivity", self.dom_nodes["sens"].value, quiet=True)
        self.dom_nodes["sens_label"].textContent = r.get("label", "")

    def _gap(self, event):
        r = pf.act("minGap", self.dom_nodes["gap"].value, quiet=True)
        self.dom_nodes["gap_label"].textContent = r.get("label", "")

    @handle("feedback_button", "click")
    def feedback_button_click(self, **event_args):
        state.feedback()

    @handle("reset_button", "click")
    def reset_button_click(self, **event_args):
        if confirm("Your monsters, pounds, badges and streak will be gone for good.", title="Reset all progress?",
                   buttons=[("Keep it", False), ("Reset", True)], role="app-dialog"):
            pf.act("reset")
            state.toast("Fresh start. Go get ’em.")
            router.go("home")
