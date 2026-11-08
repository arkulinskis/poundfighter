from anvil import *

from ._anvil_designer import HabitatTabTemplate
from ... import router, state


class HabitatTab(HabitatTabTemplate):
    """Collection: one habitat tab (a link to #collection/<id>). item = {id, name, count, on}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        state.set_attr(self, "href", router.href("collection", self.item["id"]))
        self.dom_nodes["name"].textContent = self.item["name"]
        self.dom_nodes["count"].textContent = self.item["count"]
        self.classes["on"] = bool(self.item["on"])
        state.set_attr(self, "aria-current", "page" if self.item["on"] else None)
