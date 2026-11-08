from anvil import *

from ._anvil_designer import SightingTemplate


class Sighting(SightingTemplate):
    """Home → Wild sightings: the silhouette of a monster not caught yet. item = {id, habitat}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.art.monster_id = self.item["id"]
        self.dom_nodes["habitat"].textContent = self.item["habitat"]
