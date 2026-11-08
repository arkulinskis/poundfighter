"""Server tests against the strict mock of Anvil (tools/testing/mock).

    python tools/testing/test_server.py          -> prints ALL OK, or the first failure

call(name, ...) runs a server function the way the browser does: by name, with require_user enforced, and the reply
must be JSON (a datetime or a row in a reply fails here, like it would break the page). push.py needs `cryptography`
and `requests` (installed on Anvil from server_code/requirements.txt); this PC may not have them, so they are stubbed:
the Web Push sender itself isn't tested here, the callables around it are.
"""
import importlib
import json
import os
import pathlib
import shutil
import sys
import tempfile
import types

HERE = pathlib.Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
_tmp = pathlib.Path(tempfile.mkdtemp())
shutil.copytree(PROJECT / "server_code", _tmp / "app", ignore=shutil.ignore_patterns("__pycache__"))
(_tmp / "app" / "__init__.py").write_text("")
os.environ["ANVIL_APP_YAML"] = str(PROJECT / "anvil.yaml")  # the mock's tables follow the app's own schema
sys.path[:0] = [str(HERE / "mock"), str(_tmp)]


def _stub(name, **attrs):
    mod = types.ModuleType(name)
    mod.__dict__.update(attrs)
    sys.modules[name] = mod
    return mod


try:
    import cryptography  # noqa: F401
except ImportError:
    for n in ["cryptography", "cryptography.hazmat", "cryptography.hazmat.primitives", "cryptography.hazmat.primitives.asymmetric",
              "cryptography.hazmat.primitives.ciphers", "cryptography.hazmat.primitives.kdf"]:
        _stub(n)
    _stub("cryptography.hazmat.backends", default_backend=lambda: None)
    sys.modules["cryptography.hazmat.primitives"].__dict__.update(hashes=None, serialization=None)
    _stub("cryptography.hazmat.primitives.asymmetric.ec")
    sys.modules["cryptography.hazmat.primitives.asymmetric"].ec = sys.modules["cryptography.hazmat.primitives.asymmetric.ec"]
    _stub("cryptography.hazmat.primitives.asymmetric.utils", decode_dss_signature=None)
    _stub("cryptography.hazmat.primitives.ciphers.aead", AESGCM=None)
    _stub("cryptography.hazmat.primitives.kdf.hkdf", HKDF=None)
try:
    import requests  # noqa: F401
except ImportError:
    _stub("requests")

import anvil.server  # noqa: E402
import anvil.users  # noqa: E402
from anvil.tables import app_tables as T  # noqa: E402

M = {p.stem: importlib.import_module("app." + p.stem) for p in sorted((PROJECT / "server_code").glob("*.py"))}


def call(name, *args):
    r = anvil.server.call(name, *args)
    json.dumps(r)  # strict: must be JSON-able
    return r


def as_user(row):
    anvil.users.CURRENT[0] = row
    anvil.server.session.use(row.get_id() if row is not None else None)


def raises(exc_names, name, *args):
    try:
        call(name, *args)
    except Exception as e:
        return type(e).__name__ in exc_names
    return False


def person(email, admin=False):
    return T.users.add_row(email=email, enabled=True, is_admin=admin)


admin = person("admin@example.com", admin=True)
ana = person("ana@example.com")

# ---------------------------------------------------------------------------------- accounts
as_user(None)
assert call("get_account") is None
assert raises(("PermissionDenied", "AuthenticationFailed", "Exception"), "sync_progress", None), "sync needs a user"
as_user(ana)
assert call("get_account") == {"email": "ana@example.com", "is_admin": False}
as_user(admin)
assert call("get_account")["is_admin"] is True

# ---------------------------------------------------------------------------------- progress sync (merge, never overwrite)
as_user(ana)
assert call("sync_progress", None) is None, "no account copy yet"
phone = {"xp": 120, "earned": 50, "spent": 10, "caught": {"snoozle": 2}, "totals": {"reps": 30}, "arenas": ["dojo"],
         "badges": {"first-blood": "2026-11-01"}, "streak": {"last": "2026-11-07", "count": 3}, "days": {},
         "settings": {"mic": True}}
merged = call("sync_progress", phone)
assert merged["owner"] == "ana@example.com" and merged["xp"] == 120
laptop = {"xp": 80, "earned": 90, "spent": 0, "caught": {"snoozle": 1, "deskbat": 1}, "totals": {"reps": 40},
          "arenas": ["dojo", "neon"], "badges": {"first-blood": "2026-10-30"}, "streak": {"last": "2026-11-06", "count": 5},
          "days": {}, "settings": {"mic": False}}
merged = call("sync_progress", laptop)
assert merged["xp"] == 120 and merged["earned"] == 90 and merged["spent"] == 10, "counters only go up"
assert merged["caught"] == {"snoozle": 2, "deskbat": 1} and merged["totals"]["reps"] == 40
assert merged["arenas"] == ["dojo", "neon"] and merged["badges"]["first-blood"] == "2026-10-30"
assert merged["streak"]["last"] == "2026-11-07", "the later streak wins"
assert merged["settings"] == {"mic": False}, "preferences come from the syncing device"
assert call("sync_progress", None)["xp"] == 120
assert raises(("ValueError",), "sync_progress", "not a dict")
assert raises(("ValueError",), "sync_progress", {"blob": "x" * 400000}), "too large"

# ---------------------------------------------------------------------------------- feedback inbox (admins only)
as_user(None)
assert call("submit_feedback", "bug", "The mic counts my music", "guest@example.com") is True
as_user(ana)
assert call("submit_feedback", "idea", "More monsters please") is True
assert raises(("ValueError",), "submit_feedback", "idea", "   ")
assert raises(("PermissionDenied",), "admin_list_feedback")
as_user(admin)
inbox = call("admin_list_feedback", "new")
assert len(inbox["items"]) == 2 and inbox["counts"]["new"] == 2 and inbox["players"] == 2
item = [i for i in inbox["items"] if i["kind"] == "bug"][0]
assert item["email"] == "guest@example.com"
upd = call("admin_update_feedback", item["id"], "fixed", "Mic pauses music now")
assert upd["status"] == "fixed" and upd["admin_note"] == "Mic pauses music now"
assert call("admin_list_feedback", None)["counts"]["fixed"] == 1
assert call("admin_delete_feedback", item["id"]) is True
assert len(call("admin_list_feedback", None)["items"]) == 1
as_user(ana)
assert raises(("PermissionDenied",), "admin_delete_feedback", item["id"])

# ---------------------------------------------------------------------------------- push reminders (bookkeeping only)
sub = {"endpoint": "https://push.example.com/abc", "keys": {"p256dh": "k", "auth": "a"}}
assert raises(("ValueError",), "push_subscribe", {"endpoint": "http://insecure"}, {})
assert raises(("ValueError",), "push_subscribe", {"endpoint": "https://x", "keys": {}}, {})
assert call("push_subscribe", sub, {"start": 8, "end": 6, "every": 5}, 300) is True
row = T.push_subscriptions.get(endpoint=sub["endpoint"])
assert row["prefs"]["end"] == 9 and row["prefs"]["every"] == 30, "prefs are cleaned"
assert row["user"] == ana
assert call("push_update", sub["endpoint"], {"start": 10, "end": 16}, 240) is True
assert T.push_subscriptions.get(endpoint=sub["endpoint"])["tz_offset"] == 240
assert call("push_update", "https://unknown", None, None) is False
assert call("push_activity", sub["endpoint"]) is True
assert call("push_unsubscribe", sub["endpoint"]) is True
assert T.push_subscriptions.get(endpoint=sub["endpoint"]) is None

# ---------------------------------------------------------------------------------- Privacy & Terms
as_user(ana)
st = call("legal_state")
assert st["signedIn"] is True

print("ALL OK")
