from anvil import *

from ._anvil_designer import BadgeTileTemplate


class BadgeTile(BadgeTileTemplate):
    """Me → Badges: earned (gold medal) or still locked. item = {id, name, desc, on}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        self.dom_nodes["tile"].className = "badge" + (" on" if i["on"] else "")
        self.dom_nodes["tile"].setAttribute("title", ("Earned: " if i["on"] else "Locked: ") + i["desc"])
        self.icon.classes.add("ic-medal" if i["on"] else "ic-lock")
        self.dom_nodes["name"].textContent = i["name"]
        self.dom_nodes["desc"].textContent = i["desc"]
