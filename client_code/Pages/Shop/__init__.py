from anvil import *

from ._anvil_designer import ShopTemplate
from ... import pf, router, state


class Shop(ShopTemplate):
    """#shop: Lures (buy, then arm one for the next fight), Streak Shields (pounds only, hold up to 3) and Arenas
    (unlock and pick the fight background).
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
        sh = d["shield"]
        owned, note = self.dom_nodes["shield_owned"], self.dom_nodes["shield_note"]
        owned.textContent = sh["owned"]
        owned.hidden = not sh["owned"]
        note.textContent = sh["note"]
        note.hidden = not sh["note"]
        self.dom_nodes["shield_price"].textContent = "{:,}".format(int(sh["price"]))
        self.shield_buy.classes.update({"gold": bool(sh["afford"]), "disabled": not sh["afford"]})
        state.set_attr(self.shield_buy, "aria-label", "Buy a Streak Shield for £%d" % sh["price"])
        state.set_attr(self.shield_buy, "data-key", "buy-shield")

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

    def shield_buy_click(self, event):
        pf.act("buyShield")
        self.redraw()
        router.refresh_bar()

    def _arena(self, arena_id, **event_args):
        key = state.focus_key()
        pf.act("arena", arena_id)
        self._after(self.arenas_panel, key)
