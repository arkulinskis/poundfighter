"""The app starts here (anvil.yaml: startup module). Who is signed in (one server call while Anvil's loading
spinner shows), the Privacy & Terms kit, the game engine (theme/assets/app/js/pf.js), then the page for the address.
Signed-in players get a sync of their progress right after the first page shows."""
import anvil.server
from anvil.js import window

from . import legal, pf, reminders, router, state

LEGAL_THEME = {"accent": "#ff6b2c", "accentDark": "#ffc531"}  # the Privacy & Terms page in the game's colours

legal.setup(LEGAL_THEME)
state.set_me(anvil.server.call("get_account"))
if state.me():
    legal.refresh_soon()
pf.start()
reminders.start()
router.start()
if state.me():
    window.setTimeout(pf.sync_now, 300)
