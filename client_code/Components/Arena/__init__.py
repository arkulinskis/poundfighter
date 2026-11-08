from anvil import *

from ._anvil_designer import ArenaTemplate
from ... import pf


class Arena(ArenaTemplate):
    """Hosts the engine's fight screen. The session starts on show (PF.fightStart) and is dropped on hide
    (PF.fightStop); the engine saves every rep as it happens, so leaving loses nothing already done.
    When the last fight ends the engine calls the "finished" hook (pf.py), which opens #summary."""

    def __init__(self, **properties):
        self._pos = ""
        super().__init__(**properties)

    @property
    def position(self):
        return self._pos

    @position.setter
    def position(self, value):
        self._pos = value or ""

    def start(self):
        return bool(pf.engine().fightStart(self.dom_nodes["stage"], self._pos))

    def stop(self):
        pf.engine().fightStop()

    @handle("", "hide")
    def form_hide(self, **event_args):
        self.stop()
