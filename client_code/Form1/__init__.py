from anvil import Link, server, get_url_hash, TextBox, alert, users, media, js, set_url_hash

from ._anvil_designer import Form1Template
import datetime

class Form1(Form1Template):
  def __init__(self, **properties):
    print("is online?", js.window.navigator.onLine)
    print("MY TEMP USER", users.get_user())
    