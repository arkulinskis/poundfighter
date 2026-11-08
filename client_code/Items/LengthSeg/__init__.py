from anvil import *

from ._anvil_designer import LengthSegTemplate
from ... import state


class LengthSeg(LengthSegTemplate):
    """Home: one session length (Quick hit / Coffee break / Lunch brawl). item = {id, name, sub, on}.
    A click raises x-length on the panel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["name"].textContent = self.item["name"]
        self.dom_nodes["sub"].textContent = self.item["sub"]
        self.btn.classes["on"] = bool(self.item["on"])
        state.set_attr(self.btn, "aria-pressed", "true" if self.item["on"] else "false")
        state.set_attr(self.btn, "data-key", "len-%s" % self.item["id"])

    def btn_click(self, event):
        self.parent.raise_event("x-length", value=self.item["id"])
