from anvil import *

from ._anvil_designer import MonsterTemplate
from ... import pf


class Monster(MonsterTemplate):
    """A monster's card, big: portrait (or silhouette), rarity, habitat, card tier, flavour text, catches."""

    def __init__(self, monster_id, **properties):
        super().__init__(**properties)
        m = pf.view("monster", monster_id) or {}
        self.dom_nodes["box"].className = "dlg mdetail r-%s%s" % (m.get("rarity", "common"), " locked" if m.get("locked") else "")
        self.art.look = "mystery" if m.get("mystery") else "sil" if m.get("locked") else "full"
        self.art.monster_id = monster_id
        self.dom_nodes["name"].textContent = m.get("name", "???")
        self.dom_nodes["rar"].textContent = m.get("rar", "")
        self.dom_nodes["habitat"].textContent = m.get("habitat", "")
        tier = self.dom_nodes["tier"]
        tier.textContent = m.get("tierName", "")
        tier.className = ("tier tier-" + m["tier"]) if m.get("tierName") else "tier hidden"
        flavor = self.dom_nodes["flavor"]
        flavor.textContent = ("“%s”" % m["flavor"]) if m.get("flavor") else ""
        flavor.hidden = not m.get("flavor")
        self.dom_nodes["meta"].textContent = m.get("meta", "")

    @handle("close_button", "click")
    def close_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)
