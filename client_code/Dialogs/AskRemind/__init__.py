from anvil import *

from ._anvil_designer import AskRemindTemplate


class AskRemind(AskRemindTemplate):
    """Asked once, right after the first finished session: turn on move reminders? Closes with "yes", "install"
    or None (reminders.py acts on it)."""

    def __init__(self, schedule, needs_install, can_install, **properties):
        super().__init__(**properties)
        self._needs = bool(needs_install)
        self.dom_nodes["schedule"].textContent = schedule
        self.install_note.visible = self._needs
        self.yes_button.text = "Show me how" if self._needs else "Yes, remind me"
        self.install_button.visible = bool(can_install) and not self._needs

    @handle("later_button", "click")
    def later_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("yes_button", "click")
    def yes_button_click(self, **event_args):
        self.raise_event("x-close-alert", value="install" if self._needs else "yes")

    @handle("install_button", "click")
    def install_button_click(self, **event_args):
        self.raise_event("x-close-alert", value="install")
