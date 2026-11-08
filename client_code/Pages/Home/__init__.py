from anvil import *

from ._anvil_designer import HomeTemplate
from ... import pf, reminders, state

# The app's video on the Addanapp YouTube channel (APP_MAKER/youtube/manifest.json), shown in the Watch section.
YT_VIDEO = "X7OTOzRsGy8"


class Home(HomeTemplate):
    """#home (the start screen, "Fight" in the tab bar): pick a session length and where you are, then fight.
    Voice reps switch + mic tuning, the armed lure, today's punch card, daily quests, wild sightings and the Watch
    section. Everything comes from the engine's PF.home() view."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.lengths_panel.add_event_handler("x-length", self._length)
        self.dom_nodes["yt_cover"].addEventListener("click", self._play)
        self.redraw()

    def redraw(self):
        d = pf.view("home")
        self.lengths_panel.items = d["lengths"]
        self.positions_panel.items = d["positions"]
        self.punch_panel.items = d["punches"]
        self.quest_panel.items = d["quests"]
        self.sight_panel.items = d["sightings"]
        self.sightings_box.visible = bool(d["sightings"])
        self.dom_nodes["punch_count"].textContent = "%d/%d" % (d["punchCount"], d["punchTotal"])
        on = d["micOn"]
        self.mic_switch.classes["on"] = on
        state.set_attr(self.mic_switch, "aria-checked", "true" if on else "false")
        self.mic_icon.classes.update({"ic-mic": on, "ic-micoff": not on})
        self.dom_nodes["mic_title"].textContent = "Voice reps on" if on else "Voice reps off"
        self.dom_nodes["mic_hint"].textContent = ("Grunt, clap or say “HUP!” on each rep. Screen stays awake." if on
                                                  else "Tap the monster to count each rep instead.")
        self.test_button.visible = on
        self.lure_box.visible = bool(d["lure"])
        self.dom_nodes["lure_name"].textContent = d["lure"]
        self.install_card.visible = bool(reminders.can_install()) and not pf.device().get("hideInstall")

    def _length(self, value, **event_args):
        key = state.focus_key()
        pf.act("length", value)
        self.redraw()
        state.refocus(self.lengths_panel, key)

    def mic_click(self, event):
        r = pf.act("mic")
        self.redraw()
        if r.get("tune"):
            self._tune()

    @handle("test_button", "click")
    def test_button_click(self, **event_args):
        self._tune()

    def _tune(self):
        from ...Dialogs.MicTest import MicTest
        alert(MicTest(), buttons=[], role="app-dialog", dismissible=True)

    @handle("install_button", "click")
    def install_button_click(self, **event_args):
        reminders.install()

    @handle("hide_install_button", "click")
    def hide_install_button_click(self, **event_args):
        pf.device_set(hideInstall=True)
        self.install_card.visible = False

    def _play(self, event):
        """Swap the video's cover for YouTube's player (privacy-enhanced); nothing loads from YouTube before this click."""
        self.dom_nodes["yt_frame"].innerHTML = (
            '<iframe src="https://www.youtube-nocookie.com/embed/' + YT_VIDEO + '?autoplay=1&rel=0&playsinline=1" '
            'title="PoundFighter video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen '
            'referrerpolicy="strict-origin-when-cross-origin"></iframe>')
