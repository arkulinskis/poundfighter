import anvil.users
import anvil.js as js
from ._anvil_designer import Form1Template
import datetime

class Form1(Form1Template):
  def __init__(self, **properties):
    # Set Form properties and Data Bindings.
    self.init_components(**properties)
    print(js.window.navigator.onLine)
    print(datetime.datetime.now())
    try:
      print(anvil.users.get_user())
    except:
      pass
    print(datetime.datetime.now())
    
    # Any code you write here will run before the form opens.
