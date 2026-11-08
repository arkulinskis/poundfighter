import re

from anvil import *

from ._anvil_designer import AuthTemplate
from ... import auth, legal, pf, state

EMAIL = re.compile(r"^\S+@\S+\.\S+$")
TITLES = {"signin": "Welcome back", "signup": "Create your account", "forgot": "Reset your password"}
SUBMIT = {"signin": "Sign in", "signup": "Create account", "forgot": "Send reset link"}


class Auth(AuthTemplate):
    """Sign in, create an account or reset the password, in a dialog over the game (the game is guest-first, so
    there is no sign-in page). Sign-up needs the Privacy & Terms tick box (the legal kit draws it). Continue with
    Google signs in, or makes the account on the first visit. Closes with True once someone is signed in; the
    device's progress is then merged into the account (auth._signed_in -> pf.sync_now)."""

    def __init__(self, mode="signin", **properties):
        super().__init__(**properties)
        self.dom_nodes["consent"].innerHTML = legal.consent_field()
        state.set_control_attr(self.email_box, "autocomplete", "email")
        state.set_control_attr(self.password2_box, "autocomplete", "new-password")
        img = state.control(self.google_button).querySelector("img")
        if img:
            img.setAttribute("alt", "")
        self._mode = mode if mode in TITLES else "signin"
        self._draw()

    def _draw(self):
        mode = self._mode
        guest = pf.engine().hasGuestProgress()
        blurbs = {
            "signin": "Your progress on this device will be added to your account." if guest else "Pick up where you left off.",
            "signup": "Everything you have caught so far comes with you." if guest else "Free. Keeps your monsters safe on every device.",
            "forgot": "We will email you a link to choose a new password.",
        }
        self.dom_nodes["heading"].textContent = TITLES[mode]
        self.dom_nodes["blurb"].textContent = blurbs[mode]
        self.crest_icon.classes.update({"ic-shield": mode != "forgot", "ic-key": mode == "forgot"})
        self.submit_button.text = SUBMIT[mode]
        self.pw_field.visible = mode != "forgot"
        self.pw2_field.visible = mode == "signup"
        self.consent_box.visible = mode == "signup"
        self.google_part.visible = mode != "forgot"
        self.forgot_link.visible = mode == "signin"
        self.signup_link.visible = mode == "signin"
        self.signin_link.visible = mode != "signin"
        state.set_control_attr(self.password_box, "autocomplete", "new-password" if mode == "signup" else "current-password")
        self._say("")

    def _say(self, text):
        self.message.text = text or ""
        self.message.visible = bool(text)

    def _switch(self, mode):
        self._mode = mode
        self._draw()

    @handle("forgot_link", "click")
    def forgot_link_click(self, **event_args):
        self._switch("forgot")

    @handle("signup_link", "click")
    def signup_link_click(self, **event_args):
        self._switch("signup")

    @handle("signin_link", "click")
    def signin_link_click(self, **event_args):
        self._switch("signin")

    @handle("email_box", "pressed_enter")
    def email_box_pressed_enter(self, **event_args):
        self.submit_button_click()

    @handle("password_box", "pressed_enter")
    def password_box_pressed_enter(self, **event_args):
        self.submit_button_click()

    @handle("password2_box", "pressed_enter")
    def password2_box_pressed_enter(self, **event_args):
        self.submit_button_click()

    @handle("submit_button", "click")
    def submit_button_click(self, **event_args):
        mode = self._mode
        email = (self.email_box.text or "").strip()
        password = self.password_box.text or ""
        if not EMAIL.match(email):
            self._say("Please enter a valid email address.")
            return
        if mode == "forgot":
            r = auth.reset(email)
            state.toast(r.get("message") or "If that email has an account, a reset link is on its way.", "ok")
            self.raise_event("x-close-alert", value=False)
            return
        if not password:
            self._say("Please enter your password.")
            return
        if mode == "signup":
            if len(password) < 8:
                self._say("Use at least 8 characters for your password.")
                return
            if password != (self.password2_box.text or ""):
                self._say("The two passwords do not match.")
                return
            if not legal.consent_ok(self.dom_nodes["consent"]):
                return  # the kit shows its own message next to the tick box
        self._say("")
        self.submit_button.enabled = False
        try:
            r = auth.sign_in(email, password) if mode == "signin" else auth.sign_up(email, password)
        finally:
            self.submit_button.enabled = True
        if not r["ok"]:
            self._say(r["error"])
        elif r.get("confirm"):
            state.toast("Account created. Check your email to confirm it, then sign in.", "ok")
            self.raise_event("x-close-alert", value=False)
        else:
            state.toast(("Account created" if mode == "signup" else "Signed in") + ". Your progress is saved to your account.", "ok")
            self.raise_event("x-close-alert", value=True)

    @handle("google_button", "click")
    def google_button_click(self, **event_args):
        if self._mode == "signup" and not legal.consent_ok(self.dom_nodes["consent"]):
            return
        r = auth.google()
        if not r["ok"]:
            self._say(r["error"])
            return
        state.toast("Signed in with Google. Your progress is saved to your account.", "ok")
        self.raise_event("x-close-alert", value=True)

    @handle("", "show")
    def form_show(self, **event_args):
        self.email_box.focus()
