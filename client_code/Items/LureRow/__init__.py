from anvil import *

from ._anvil_designer import LureRowTemplate
from ... import state


class LureRow(LureRowTemplate):
    """Shop: one lure. item = {id, name, desc, rarity, price, owned, armed, afford}. Buy raises x-buy, Arm x-arm."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        self.dom_nodes["row"].className = "shop-item r-" + i["rarity"]
        self.dom_nodes["name"].textContent = i["name"]
        self.dom_nodes["desc"].textContent = i["desc"]
        owned = self.dom_nodes["owned"]
        owned.textContent = ("Owned: %d" % i["owned"]) if i["owned"] else ""
        owned.hidden = not i["owned"]
        self.dom_nodes["price"].textContent = "{:,}".format(int(i["price"]))
        self.buy.classes.update({"gold": bool(i["afford"]), "disabled": not i["afford"]})
        state.set_attr(self.buy, "aria-label", "Buy %s for £%d" % (i["name"], i["price"]))
        state.set_attr(self.buy, "data-key", "buy-" + i["id"])
        self.arm.visible = bool(i["owned"])
        self.arm.classes["on"] = bool(i["armed"])
        state.set_attr(self.arm, "aria-pressed", "true" if i["armed"] else "false")
        state.set_attr(self.arm, "data-key", "arm-" + i["id"])
        self.dom_nodes["arm_text"].textContent = "Armed" if i["armed"] else "Arm"
        state.set_attr(self.arm, "aria-label", ("%s armed" if i["armed"] else "Arm %s") % i["name"])

    def buy_click(self, event):
        self.parent.raise_event("x-buy", lure_id=self.item["id"])

    def arm_click(self, event):
        self.parent.raise_event("x-arm", lure_id=self.item["id"])
