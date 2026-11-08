import json

import anvil.server
from anvil import *

from ._anvil_designer import FeedbackRowTemplate
from ... import state

STATUSES = [("New", "new"), ("Reviewing", "reviewing"), ("Fixed", "fixed"), ("Won't fix", "wontfix")]


class FeedbackRow(FeedbackRowTemplate):
    """Admin: one older feedback message. item = {id, created, email, kind, message, context, status, admin_note}.
    Save and Delete raise x-changed so the page reloads the list."""

    def __init__(self, **properties):
        super().__init__(**properties)
        i = self.item
        kind = i.get("kind") or "other"
        self.dom_nodes["row"].className = "fb-item kind-" + kind
        self.dom_nodes["kind"].textContent = kind
        self.dom_nodes["when"].textContent = (state.short_date(i.get("created")) + " " + (i.get("created") or "")[11:16]).strip()
        email = i.get("email") or ""
        self.email_link.visible = bool(email)
        self.anon.visible = not email
        state.set_attr(self.email_link, "href", "mailto:" + email)
        self.dom_nodes["email"].textContent = email
        self.dom_nodes["msg"].textContent = i.get("message") or ""
        ctx = i.get("context") or {}
        self.ctx_box.visible = bool(ctx)
        self.dom_nodes["ctx"].textContent = json.dumps(ctx, indent=2) if ctx else ""
        self.status_box.items = STATUSES
        self.status_box.selected_value = i.get("status") or "new"
        state.set_control_attr(self.status_box, "aria-label", "Status")
        self.note_box.text = i.get("admin_note") or ""
        state.set_control_attr(self.note_box, "aria-label", "Private note")

    @handle("save_button", "click")
    def save_button_click(self, **event_args):
        try:
            anvil.server.call("admin_update_feedback", self.item["id"], self.status_box.selected_value, self.note_box.text or "")
        except Exception as e:
            state.toast(str(e), "error")
            return
        state.toast("Saved", "ok")
        self.parent.raise_event("x-changed")

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        if not confirm("This can't be undone.", title="Delete this message?", buttons=[("Keep", False), ("Delete", True)],
                       role="app-dialog"):
            return
        try:
            anvil.server.call("admin_delete_feedback", self.item["id"])
            state.toast("Deleted")
        except Exception as e:
            state.toast(str(e), "error")
        self.parent.raise_event("x-changed")
