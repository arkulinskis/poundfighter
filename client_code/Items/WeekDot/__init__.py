from anvil import *

from ._anvil_designer import WeekDotTemplate


class WeekDot(WeekDotTemplate):
    """Home → streak strip: one day of this week (Mon-Sun). item = {key, label, on, shield, rest, today, future, title}.
    A gold coin when you fought, a shield when a Streak Shield covered it, dotted on rest days, outlined today."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        cell = self.dom_nodes["cell"]
        cell.className = "wday" + "".join(" " + k for k in ("on", "shield", "rest", "today", "future") if i.get(k))
        cell.setAttribute("title", i["title"])
        cell.setAttribute("aria-label", i["title"])
        self.icon.classes.update({"ic-check": not i["shield"], "ic-shield": bool(i["shield"])})
        self.dom_nodes["label"].textContent = i["label"]
