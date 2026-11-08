from anvil import *

from ._anvil_designer import ShellTemplate
from ... import pf, router


class Shell(ShellTemplate):
    """The game frame around every page: the top bar (level badge, rank, XP bar, streak and pounds chips), the footer
    links and the phone-style tab bar. Pages use it with <anvil-form layout="PoundFighter.Layouts.Shell">.

    Anvil keeps ONE Shell while pages come and go, so everything that depends on the page or the game state is drawn
    in refresh(page) (router.show calls it after every page change) and refresh_bar() (after anything that changes
    pounds, XP or the streak)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.refresh("")

    def refresh(self, page):
        bars = page not in ("fight", "summary")
        self.topbar.visible = bars
        self.tabbar.visible = bars
        self.footer.visible = page != "fight"
        self.classes.update({"no-bars": not bars, "full-screen": page == "fight"})
        self.tab_panel.items = [{"page": p, "label": label, "icon": icon, "on": p == page or (p == "me" and page == "admin")}
                                for p, label, icon in router.NAV]
        self.refresh_bar()

    def refresh_bar(self):
        c = pf.view("chrome")
        self.dom_nodes["level"].textContent = str(c["level"])
        self.dom_nodes["rank"].textContent = c["rank"]
        self.dom_nodes["xp"].style.transform = "scaleX(%.3f)" % c["pct"]
        self.dom_nodes["streak"].textContent = str(c["streak"])
        self.dom_nodes["pounds"].textContent = "{:,}".format(int(c["pounds"]))
        self.streak_chip.classes["hot"] = c["streak"] > 0
