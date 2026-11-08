from anvil import *

from ._anvil_designer import SummaryTemplate
from ... import pf, router, state


class Summary(SummaryTemplate):
    """#summary: the results of the session that just ended (stats, level up, captured monsters, finished quests,
    chests and badges, the punch card), a nudge to save progress in an account, Home / Fight again.
    Opened by the engine when a session ends; without a session (a reload) it shows Home instead."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self._data = pf.view("summary")
        if not self._data:
            router.replace("home")
            window_go_home()
            return
        self.redraw()

    def redraw(self):
        d = self._data or pf.view("summary")
        if not d:
            return
        title = self.dom_nodes["title"]
        title.textContent = d["title"]
        title.className = "gold-text big-win" if d["win"] else ""
        self.dom_nodes["lead"].textContent = d["lead"]
        self.stats_panel.items = d["stats"]
        lv = d["levelUp"]
        self.levelup_box.visible = bool(lv)
        if lv:
            self.dom_nodes["new_level"].textContent = str(lv["level"])
            self.dom_nodes["new_rank"].textContent = lv["rank"]
        self.captured_box.visible = bool(d["captured"])
        self.captured_panel.items = d["captured"]
        self.rewards_box.visible = bool(d["rewards"])
        self.rewards_panel.items = d["rewards"]
        self.punch_panel.items = d["punches"]
        self.dom_nodes["punch_count"].textContent = "%d/%d" % (d["punchCount"], d["punchTotal"])
        self.save_box.visible = not state.me()

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        from ...Dialogs.Auth import Auth
        if alert(Auth(mode="signup"), buttons=[], role="app-dialog", dismissible=True):
            self.save_box.visible = not state.me()

    @handle("again_button", "click")
    def again_button_click(self, **event_args):
        pf.engine().unlock()
        router.go("fight", (self._data or {}).get("pos") or "sitting")


def window_go_home():
    """Called while the page is still being built: open Home once this call has finished."""
    from anvil.js import window
    window.setTimeout(lambda: router.show(), 0)
