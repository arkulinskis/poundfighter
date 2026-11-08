"""Page addresses: #name/arg1/arg2 -> a page Form (open_form).

PoundFighter is guest-first: every page except Admin works without an account (progress lives in this browser and
syncs to the account once someone signs in). Links in templates are plain <a href="#shop">; code calls
router.go("collection", "office").

    PAGES[name] = (who may open it, browser-tab title)   who: None = anyone, "admin" = admins only
    NAV = the tab bar: (page, label, icon)
New page: add it to PAGES and _form().
"""
import anvil
import anvil.js
from anvil.js import window

from . import pf, state

PAGES = {
    "home": (None, "Fight"),
    "collection": (None, "Collection"),
    "shop": (None, "Shop"),
    "me": (None, "Me"),
    "fight": (None, "Fight!"),
    "summary": (None, "Results"),
    "admin": ("admin", "Feedback inbox"),
}
NAV = [("home", "Fight", "zap"), ("collection", "Collection", "grid"), ("shop", "Shop", "bag"), ("me", "Me", "user")]
NO_CHROME = ("fight",)  # full-screen pages: no top bar, tab bar or footer
APP_NAME = "PoundFighter"
_r: dict = {"listening": False, "page": None, "name": ""}


def _form(name):
    """The page's Form class (imported when first needed, so start-up stays quick)."""
    if name == "collection":
        from .Pages.Collection import Collection
        return Collection
    if name == "shop":
        from .Pages.Shop import Shop
        return Shop
    if name == "me":
        from .Pages.Me import Me
        return Me
    if name == "fight":
        from .Pages.Fight import Fight
        return Fight
    if name == "summary":
        from .Pages.Summary import Summary
        return Summary
    if name == "admin":
        from .Pages.Admin import Admin
        return Admin
    from .Pages.Home import Home
    return Home


def parse(hash_text):
    h = (hash_text or "").lstrip("#").lstrip("!").lstrip("/").split("?")[0]
    parts = [window.decodeURIComponent(p) for p in h.split("/") if p]
    return (parts[0] if parts else ""), parts[1:]


def href(name, *args):
    """'#name/arg1/arg2' with every part URL-encoded."""
    return "#" + "/".join([name] + [window.encodeURIComponent(str(a)) for a in args if a not in (None, "")])


def current():
    return _r["name"]


def show():
    """Open the page for the current address."""
    name, args = parse(window.location.hash)
    if name not in PAGES:
        name, args = "home", []
    if PAGES[name][0] == "admin" and not state.is_admin():
        if state.me():
            state.toast("That page is for admins only.", "error")
        name, args = "me", []
        window.history.replaceState(None, "", "#me")
    old = _r["page"]
    if old is not None and hasattr(old, "leave"):
        old.leave()  # stop timers, the fight engine, the mic
    window.document.title = PAGES[name][1] + " · " + APP_NAME
    window.UI_READY = False
    pf.set_route(name)
    page = _form(name)(args=args)
    _r["page"], _r["name"] = page, name
    anvil.open_form(page)
    shell = getattr(page, "layout", None)
    if shell is not None and hasattr(shell, "refresh"):
        shell.refresh(name)  # Anvil reuses the layout between pages: tell it which page is open
    window.scrollTo(0, 0)
    if not getattr(page, "waits", False):
        window.UI_READY = True  # tests and screenshots wait for this


def go(name, *args):
    """Go to a page. Same address again = reload the page."""
    target = href(name, *args)
    if window.location.hash == target:
        show()
    else:
        window.location.hash = target


def replace(name, *args):
    """Change the address without opening anything (a page that switches its own view)."""
    window.history.replaceState(None, "", href(name, *args))


def refresh_page():
    """Redraw the open page and the top bar after a background change (sign-in, a sync that merged progress)."""
    page = _r["page"]
    if page is None:
        return
    if hasattr(page, "redraw"):
        page.redraw()
    refresh_bar()


def refresh_bar():
    page = _r["page"]
    shell = getattr(page, "layout", None) if page is not None else None
    if shell is not None and hasattr(shell, "refresh_bar"):
        shell.refresh_bar()


def _on_hash(event):
    show()


def _on_click(event):
    """In-app links (<a href="#shop">) only change the hash. Anvil puts a <base href> in the page, so the browser
    would otherwise reload the whole app when the visitor arrived with a query string (?utm_source=...)."""
    if event.defaultPrevented or event.button or event.ctrlKey or event.metaKey or event.shiftKey or event.altKey:
        return
    target = event.target
    link = target.closest("a[href^='#']") if target and getattr(target, "closest", None) else None
    if not link or link.getAttribute("target"):
        return
    event.preventDefault()
    if window.location.hash == link.getAttribute("href"):
        show()
    else:
        window.location.hash = link.getAttribute("href")


def start():
    if not _r["listening"]:
        window.addEventListener("hashchange", anvil.js.report_exceptions(_on_hash))
        window.document.addEventListener("click", anvil.js.report_exceptions(_on_click))
        _r["listening"] = True
    show()
