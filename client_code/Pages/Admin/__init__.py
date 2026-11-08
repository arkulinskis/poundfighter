import anvil.js
import anvil.server
from anvil import *

from ._anvil_designer import AdminTemplate
from ... import state

FILTERS = [("new", "New"), ("reviewing", "Reviewing"), ("fixed", "Fixed"), ("wontfix", "Won't fix"), ("all", "All")]


class Admin(AdminTemplate):
    """#admin (admins only): the older in-app feedback messages (new feedback goes to Prepsto). Filter by status,
    change the status, keep a private note, delete. Server: admin_list_feedback / admin_update_feedback /
    admin_delete_feedback."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self._filter = args[0] if args and args[0] in dict(FILTERS) else "new"
        self.items_panel.add_event_handler("x-changed", self._load)
        self._load()

    def _load(self, **event_args):
        self.message.visible = False
        try:
            d = anvil.server.call("admin_list_feedback", None if self._filter == "all" else self._filter)
        except Exception as e:
            self.message.text = "Only admins can see this page." if type(e).__name__ == "PermissionDenied" else str(e)
            self.message.role = "msg-error"
            self.message.visible = True
            return
        counts = d.get("counts") or {}
        total = sum(counts.values())
        players = d.get("players") or 0
        self.dom_nodes["totals"].textContent = "%s · %s" % (state.plural(players, "player account"), state.plural(total, "message"))
        for key, label in FILTERS:
            chip = getattr(self, "f_" + key)
            chip.classes["on"] = key == self._filter
            state.set_attr(chip, "aria-pressed", "true" if key == self._filter else "false")
            n = total if key == "all" else counts.get(key)
            anvil.js.get_dom_node(chip).textContent = label + (" · %d" % n if n is not None else "")
        items = d.get("items") or []
        self.items_panel.items = items
        self.empty.visible = not items
        self.dom_nodes["empty_text"].textContent = "Nothing here." + (" Inbox zero!" if self._filter == "new" else "")

    def filter_click(self, event):
        self._filter = event.currentTarget.getAttribute("data-f")
        self._load()

    @handle("refresh_button", "click")
    def refresh_button_click(self, **event_args):
        self._load()
