import json

import anvil.js
import anvil.server
import anvil.users

from ._anvil_designer import MainTemplate
from .. import legal


class Main(MainTemplate):
  """Full-screen wrapper around the PoundFighter web app.

  The game lives in theme/assets/app/ (plain HTML/CSS/JS) and is shown in an
  iframe. It talks to this form with postMessage (see app/js/bridge.js), and
  this form does the Anvil work: sign-in, server calls, app install.
  """

  def __init__(self, **properties):
    self.init_components(**properties)
    self._window = anvil.js.window
    self._origin = self._window.location.origin
    self._window.addEventListener('message', self._on_message)

  # ---------------------------------------------------------------- plumbing

  def _frame(self):
    return self._window.document.querySelector('iframe[data-pf-app]')

  def _post(self, payload):
    frame = self._frame()
    if frame and frame.contentWindow:
      frame.contentWindow.postMessage(json.dumps(payload), self._origin)

  def _on_message(self, event):
    # Only same-site pages can pass this check, so only our own game frame
    if event.origin != self._origin:
      return
    data = event.data
    if not isinstance(data, str):
      return
    try:
      msg = json.loads(data)
    except Exception:
      return
    if not isinstance(msg, dict) or msg.get('pf') != 1 or 'method' not in msg:
      return
    reply = {'pf': 1, 'id': msg.get('id')}
    try:
      handler = getattr(self, 'm_' + str(msg['method']), None)
      if handler is None:
        raise ValueError('Unknown method ' + str(msg['method']))
      reply['ok'] = True
      reply['result'] = handler(**(msg.get('args') or {}))
    except Exception as e:
      reply['ok'] = False
      reply['error'] = type(e).__name__
      reply['message'] = str(e)
    self._post(reply)

  # ---------------------------------------------------------------- methods

  def m_hello(self):
    legal.refresh_soon()  # Privacy & Terms: reminder for signed-in players who haven't accepted
    return {
      'account': anvil.server.call('get_account'),
      'installable': bool(getattr(self._window, 'pfInstallPrompt', None)),
    }

  def m_login(self, email, password):
    anvil.users.login_with_email(email.strip(), password, remember=True)
    legal.refresh_soon()
    return anvil.server.call('get_account')

  def m_signup(self, email, password):
    anvil.users.signup_with_email(email.strip(), password, remember=True)
    account = anvil.server.call('get_account')
    legal.refresh_soon()  # records the sign-up tick box
    if not account:
      # Email confirmation is switched on: they must click the link first
      return {'needs_confirmation': True}
    return account

  def m_logout(self):
    anvil.users.logout()
    legal.signed_out()
    return True

  def m_legal_open(self, tab='overview'):
    legal.open(tab)
    return True

  def m_forgot(self, email):
    try:
      anvil.users.send_password_reset_email(email.strip())
    except Exception:
      pass  # never reveal whether an address has an account
    return True

  def m_change_password(self, old_password, new_password):
    return anvil.server.call('change_password', old_password, new_password)

  def m_install(self):
    # Shows the browser's "Install app" prompt (captured in native_deps head_html)
    return self._window.pfInstall()

  def m_call(self, name, args=None):
    allowed = {
      'sync_progress', 'submit_feedback',
      'admin_list_feedback', 'admin_update_feedback', 'admin_delete_feedback',
      'push_public_key', 'push_subscribe', 'push_update', 'push_unsubscribe', 'push_activity', 'push_test',
    }
    if name not in allowed:
      raise ValueError('Not allowed: ' + str(name))
    return anvil.server.call(name, *(args or []))
