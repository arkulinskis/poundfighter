from anvil import *

from ._anvil_designer import RewardRowTemplate


class RewardRow(RewardRowTemplate):
    """Summary → Rewards: a finished quest, an opened chest or a new badge. item = {icon, text, pounds}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        self.icon.classes.add("ic-" + i["icon"])
        self.dom_nodes["text"].textContent = i["text"]
        self.coin.visible = bool(i["pounds"])
        self.dom_nodes["pounds"].textContent = "{:,}".format(int(i["pounds"] or 0))
