from anvil import *

from ._anvil_designer import ChangePasswordTemplate
from ... import auth, state


class ChangePassword(ChangePasswordTemplate):
    """Change the account's password (server: change_password checks the old one). Accounts without a password to
    check (Google sign-in, old hashes) get a reset email instead."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.dom_nodes["email"].textContent = (state.me() or {}).get("email") or ""
        state.set_control_attr(self.old_box, "autocomplete", "current-password")
        state.set_control_attr(self.new1_box, "autocomplete", "new-password")
        state.set_control_attr(self.new2_box, "autocomplete", "new-password")

    def _say(self, text):
        self.message.text = text
        self.message.visible = bool(text)

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=False)

    @handle("new2_box", "pressed_enter")
    def new2_box_pressed_enter(self, **event_args):
        self.save_button_click()

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        old, n1, n2 = self.old_box.text or "", self.new1_box.text or "", self.new2_box.text or ""
        if not old:
            self._say("Please enter your current password.")
            return
        if len(n1) < 8:
            self._say("Use at least 8 characters for the new password.")
            return
        if n1 != n2:
            self._say("The two new passwords do not match.")
            return
        self.save_button.enabled = False
        try:
            r = auth.change_password(old, n1)
        finally:
            self.save_button.enabled = True
        if not r["ok"]:
            self._say(r["error"])
            return
        state.toast("We emailed you a link to set a new password." if r.get("emailed") else "Password changed.", "ok")
        self.raise_event("x-close-alert", value=True)

    @handle("", "show")
    def form_show(self, **event_args):
        self.old_box.focus()
