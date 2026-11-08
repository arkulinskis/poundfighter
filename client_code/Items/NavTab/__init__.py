from anvil import *

from ._anvil_designer import NavTabTemplate
from ... import router, state


class NavTab(NavTabTemplate):
    """A tab in the bottom bar. item = {page, label, icon, on} from router.NAV."""

    def __init__(self, **properties):
        super().__init__(**properties)
        state.set_attr(self, "href", router.href(self.item["page"]))
        self.dom_nodes["label"].textContent = self.item["label"]
        self.icon.classes.add("ic-" + self.item["icon"])
        self.classes["on"] = bool(self.item.get("on"))
        state.set_attr(self, "aria-current", "page" if self.item.get("on") else None)
