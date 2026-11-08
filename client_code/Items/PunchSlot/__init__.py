from anvil import *

from ._anvil_designer import PunchSlotTemplate


class PunchSlot(PunchSlotTemplate):
    """One of the 8 punch-card circles. item = {n, on, chest, text} (text = the hour it was punched, e.g. "10a")."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        slot = self.dom_nodes["slot"]
        slot.className = "punch" + (" on" if i["on"] else "") + (" chest" if i["chest"] else "")
        slot.setAttribute("title", ("Punched at " + i["text"]) if i["on"] else ("Chest at %d punches" % i["n"]) if i["chest"] else "Punch %d" % i["n"])
        self.gift.visible = bool(i["chest"] and not i["on"])
        self.dom_nodes["text"].textContent = i["text"]
