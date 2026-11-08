from anvil import *

from ._anvil_designer import MonsterCardTemplate


class MonsterCard(MonsterCardTemplate):
    """A monster card (Collection and the Summary's "Captured"). item = {id, name, rar, rarity, tier, locked, mystery,
    isNew?}. A click opens the monster's details."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        card = self.dom_nodes["card"]
        cls = "mcard r-" + i["rarity"]
        if i["locked"]:
            cls += " locked"
        elif i.get("tier"):
            cls += " t-" + i["tier"]
        card.className = cls
        card.setAttribute("aria-label", ("Unknown %s monster" % i["rar"]) if i["locked"] else "%s, %s" % (i["name"], i["rar"]))
        self.art.look = "mystery" if i["mystery"] else "sil" if i["locked"] else "full"
        self.art.monster_id = i["id"]
        self.dom_nodes["name"].textContent = i["name"]
        self.dom_nodes["rar"].textContent = i["rar"]
        self.new_tag.visible = bool(i.get("isNew"))

    def card_click(self, event):
        from ...Dialogs.Monster import Monster
        alert(Monster(monster_id=self.item["id"]), buttons=[], role="app-dialog", dismissible=True)
