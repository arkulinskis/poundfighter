from anvil import *

from ._anvil_designer import StatTileTemplate


class StatTile(StatTileTemplate):
    """A big number with its label (Me and Summary). item = {label, value}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["value"].textContent = self.item["value"]
        self.dom_nodes["label"].textContent = self.item["label"]
