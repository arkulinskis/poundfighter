from anvil import *

from ._anvil_designer import PositionButtonTemplate
from ... import pf, router


class PositionButton(PositionButtonTemplate):
    """Home: "I'm in bed / at my desk / standing / in a meeting" = start a session there.
    item = {id, label, sub, icon, go, silent}. Meeting mode (silent) is a quiet grey button that says SHH."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["label"].textContent = self.item["label"]
        self.dom_nodes["sub"].textContent = self.item["sub"]
        self.icon.classes.add("ic-" + self.item["icon"])
        self.btn.classes.add("pos-" + self.item["id"])
        self.dom_nodes["go"].textContent = self.item.get("go") or "FIGHT"

    def btn_click(self, event):
        if not self.item.get("silent"):
            pf.engine().unlock()  # first thing in the tap: iPhone only starts sound from a user gesture
        router.go("fight", self.item["id"])
