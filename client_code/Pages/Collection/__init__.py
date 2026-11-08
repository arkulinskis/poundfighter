from anvil import *

from ._anvil_designer import CollectionTemplate
from ... import pf


class Collection(CollectionTemplate):
    """#collection/<habitat> (bedroom, office, lounge): the 36 monsters by habitat; caught ones show their portrait,
    card tier and catch count, the rest a silhouette (Legendaries a "?"). A card opens Dialogs/Monster."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self._tab = args[0] if args else "bedroom"
        self.redraw()

    def redraw(self):
        d = pf.view("collection", self._tab)
        self._tab = d["tab"]
        self.dom_nodes["count"].textContent = "%d of %d monsters captured" % (d["unique"], d["total"])
        self.dom_nodes["fill"].style.transform = "scaleX(%.3f)" % d["pct"]
        self.dom_nodes["bar"].setAttribute("aria-valuenow", str(d["unique"]))
        self.dom_nodes["bar"].setAttribute("aria-valuemax", str(d["total"]))
        self.tabs_panel.items = d["tabs"]
        self.dom_nodes["blurb"].textContent = d["blurb"]
        self.cards_panel.items = d["cards"]
