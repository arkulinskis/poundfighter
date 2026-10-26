from ._anvil_designer import MainTemplate


class Main(MainTemplate):
  """Full-screen wrapper around the PoundFighter web app.

  The whole game lives in theme/assets/app/ (plain HTML/CSS/JS) and is
  served by Anvil at /_/theme/app/index.html. This form just shows it.
  """

  def __init__(self, **properties):
    self.init_components(**properties)
