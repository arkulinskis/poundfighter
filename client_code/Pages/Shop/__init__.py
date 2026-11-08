from anvil import *

from ._anvil_designer import ShopTemplate
from ... import pf, router, state


class Shop(ShopTemplate):
    """#shop: Lures (buy, then arm one for the next fight) and Arenas (unlock and pick the fight background).
    Items raise x-buy / x-arm / x-arena; the engine checks the balance and keeps the totals merge-safe."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.lures_panel.add_event_handler("x-buy", self._buy)
        self.lures_panel.add_event_handler("x-arm", self._arm)
        self.arenas_panel.add_event_handler("x-arena", self._arena)
        self.redraw()

    def redraw(self):
        d = pf.view("shop")
        self.dom_nodes["pounds"].textContent = "{:,}".format(int(d["pounds"]))
        self.lures_panel.items = d["lures"]
        self.arenas_panel.items = d["arenas"]

    def _after(self, panel, key):
        self.redraw()
        router.refresh_bar()
        state.refocus(panel, key)

    def _buy(self, lure_id, **event_args):
        key = state.focus_key()
        pf.act("buyLure", lure_id)
        self._after(self.lures_panel, key)

    def _arm(self, lure_id, **event_args):
        key = state.focus_key()
        pf.act("armLure", lure_id)
        self._after(self.lures_panel, key)

    def _arena(self, arena_id, **event_args):
        key = state.focus_key()
        pf.act("arena", arena_id)
        self._after(self.arenas_panel, key)
