from anvil import *

from ._anvil_designer import ArenaTileTemplate


class ArenaTile(ArenaTileTemplate):
    """Shop: one arena (its background is the tile). item = {id, name, on, owned, price, state}. A click raises
    x-arena (unlock if needed, then use it)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        tile = self.dom_nodes["tile"]
        tile.className = "arena-tile arena-%s%s" % (i["id"], " on" if i["on"] else "")
        tile.setAttribute("data-key", "arena-" + i["id"])
        tile.setAttribute("aria-pressed", "true" if i["on"] else "false")
        tile.setAttribute("aria-label", "%s: %s" % (i["name"], "in use" if i["on"] else "use it" if i["owned"] else "unlock for " + i["state"]))
        self.dom_nodes["name"].textContent = i["name"]
        self.dom_nodes["state"].textContent = i["state"]

    def tile_click(self, event):
        self.parent.raise_event("x-arena", arena_id=self.item["id"])
