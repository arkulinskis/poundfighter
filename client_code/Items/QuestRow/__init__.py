from anvil import *

from ._anvil_designer import QuestRowTemplate


class QuestRow(QuestRowTemplate):
    """A daily quest with its progress bar. item = {text, reward, value, target, pct, claimed}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        self.dom_nodes["row"].className = "quest" + (" claimed" if i["claimed"] else "")
        self.tick.visible = bool(i["claimed"])
        self.dom_nodes["text"].textContent = i["text"]
        self.dom_nodes["reward"].textContent = "{:,}".format(int(i["reward"]))
        self.dom_nodes["fill"].style.transform = "scaleX(%.3f)" % min(1, i["pct"])
        self.dom_nodes["num"].textContent = "%d / %d" % (i["value"], i["target"])
