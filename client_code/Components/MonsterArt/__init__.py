from anvil import *

from ._anvil_designer import MonsterArtTemplate
from ... import pf


class MonsterArt(MonsterArtTemplate):
    """A monster's portrait (SVG from the engine). look: "full", "sil" (silhouette) or "mystery" (a "?")."""

    def __init__(self, **properties):
        self._id, self._look, self._ready = "", "full", False
        super().__init__(**properties)
        self._ready = True
        self._draw()

    def _draw(self):
        if not self._ready:
            return
        box = self.dom_nodes["box"]
        box.className = "m-art " + {"sil": "sil", "mystery": "mystery"}.get(self._look, "")
        if self._look == "mystery":
            box.innerHTML = "<span>?</span>"
        else:
            box.innerHTML = pf.art(self._id) if self._id else ""

    @property
    def monster_id(self):
        return self._id

    @monster_id.setter
    def monster_id(self, value):
        self._id = value or ""
        self._draw()

    @property
    def look(self):
        return self._look

    @look.setter
    def look(self, value):
        self._look = value or "full"
        self._draw()
