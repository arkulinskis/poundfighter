"""Local tests only: make the smoke test's admin account an admin (PoundFighter has no "first signer is admin" rule;
admins are ticked by hand in the users table on Anvil).

    python tools/ui/promote.py ws://localhost:<port>/_/uplink <uplink key>

tools/ui_test.py starts the local App Server with --uplink-key and runs this beside smoke.js: for 15 minutes it
ticks is_admin on every account whose email starts with "admin-" and ends with "@smoke.test". Needs anvil-uplink
(pip install --user anvil-uplink), so it is run without -I.
"""
import sys
import time

import anvil.server
from anvil.tables import app_tables

url, key = sys.argv[1], sys.argv[2]
for _ in range(30):
    try:
        anvil.server.connect(key, url=url, quiet=True)
        break
    except Exception:
        time.sleep(2)
end = time.time() + 900
while time.time() < end:
    try:
        for row in app_tables.users.search():
            email = row["email"] or ""
            if email.startswith("admin-") and email.endswith("@smoke.test") and not row["is_admin"]:
                row["is_admin"] = True
    except Exception:
        pass
    time.sleep(1)
