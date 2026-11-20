from anvil import *

from ._anvil_designer import DayCellTemplate


class DayCell(DayCellTemplate):
    """Me → "Last 3 weeks": one day of the calendar. item = {key, day, lv (0-4 gold shade by punches), on, shield,
    rest, today, future, title}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        cell = self.dom_nodes["cell"]
        cell.className = "cal-cell lv-%d" % i["lv"] + "".join(" " + k for k in ("shield", "rest", "today", "future") if i.get(k))
        cell.setAttribute("title", i["title"])
        cell.setAttribute("aria-label", i["title"])
        self.shield.visible = bool(i["shield"])
        self.dom_nodes["day"].textContent = str(i["day"])
