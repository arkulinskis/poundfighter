from anvil import *

from ._anvil_designer import FightTemplate
from ... import router

POSITIONS = ("bed", "sitting", "standing")


class Fight(FightTemplate):
    """#fight/<position> (bed, sitting, standing): a session of 1, 3 or 5 fights, full screen. The whole screen is the
    engine's (Components/Arena); it starts when the page is on screen (the engine draws by element id) and goes to
    #summary by itself when the last fight ends."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self._pos = args[0] if args and args[0] in POSITIONS else ""
        self.arena.position = self._pos

    @handle("", "show")
    def form_show(self, **event_args):
        if not self._pos or not self.arena.start():
            router.go("home")

    def leave(self):
        self.arena.stop()
