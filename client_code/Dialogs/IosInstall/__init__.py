from anvil import *

from ._anvil_designer import IosInstallTemplate


class IosInstall(IosInstallTemplate):
    """The Home Screen steps for iPhone and iPad (they only allow notifications for installed web apps)."""

    def __init__(self, **properties):
        super().__init__(**properties)

    @handle("ok_button", "click")
    def ok_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=True)
