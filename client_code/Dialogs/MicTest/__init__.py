from anvil import *
from anvil.js import window

from ._anvil_designer import MicTestTemplate
from ... import pf, state


class MicTest(MicTestTemplate):
    """Tune the mic: the engine (pf.js micTestOpen) listens and moves the meter (elements tLvl / tBase / tThr /
    tCount by id), counting each "rep" it hears; the sensitivity slider changes the rep line live. Music stops while
    it is open. Closing it (Done, Esc or outside) stops the mic."""

    def __init__(self, **properties):
        super().__init__(**properties)
        st = pf.view("me")["settings"]
        self.dom_nodes["sens"].value = st["sensitivity"]
        self.dom_nodes["sens_label"].textContent = st["sensLabel"]
        self.dom_nodes["sens"].addEventListener("input", self._sens)
        self._open = False

    @handle("", "show")
    def form_show(self, **event_args):
        if self._open:
            return
        self._open = True
        window.setTimeout(self._start, 30)

    def _start(self):
        self.dom_nodes["status"].textContent = pf.engine().micTestOpen()

    @handle("", "hide")
    def form_hide(self, **event_args):
        if self._open:
            self._open = False
            pf.engine().micTestClose()

    def _sens(self, event):
        r = pf.act("sensitivity", self.dom_nodes["sens"].value, quiet=True)
        self.dom_nodes["sens_label"].textContent = r.get("label", "")

    @handle("recalibrate_button", "click")
    def recalibrate_button_click(self, **event_args):
        pf.engine().recalibrate()
        state.toast("Measuring the room… stay quiet")

    @handle("done_button", "click")
    def done_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=True)
