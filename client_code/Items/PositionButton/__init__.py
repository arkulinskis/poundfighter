from anvil import *

from ._anvil_designer import PositionButtonTemplate
from ... import pf, router


class PositionButton(PositionButtonTemplate):
    """Home: "I'm in bed / at my desk / standing" = start a session there. item = {id, label, sub, icon}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["label"].textContent = self.item["label"]
        self.dom_nodes["sub"].textContent = self.item["sub"]
        self.icon.classes.add("ic-" + self.item["icon"])
        self.btn.classes.add("pos-" + self.item["id"])

    def btn_click(self, event):
        pf.engine().unlock()  # first thing in the tap: iPhone only starts sound from a user gesture
        router.go("fight", self.item["id"])
