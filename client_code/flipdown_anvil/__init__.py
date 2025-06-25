from ._anvil_designer import flipdown_anvilTemplate
import time
import random



# Start the countdown and set the ifEnded callback

class flipdown_anvil(flipdown_anvilTemplate):
  def __init__(self, **properties):
    self.init_components(**properties)
    self.exercise_list = {
  "bed_exercises": [
    {
      "name": "Leg Raises",
      "description": "Lie on your back and slowly lift one leg up while keeping the other flat, then alternate. Strengthens core and legs."
    },
    {
      "name": "Glute Bridges",
      "description": "Bend your knees with feet flat, then lift your hips off the bed, squeezing your glutes, and lower down."
    },
    {
      "name": "Knee-to-Chest Stretch",
      "description": "Pull one knee toward your chest and hold for 20 seconds, then switch sides. Helps stretch the lower back."
    },
    {
      "name": "Ankle Pumps",
      "description": "Point and flex your feet repeatedly to improve circulation and ankle mobility."
    },
    {
      "name": "Butterfly Stretch",
      "description": "Bring the soles of your feet together and let your knees fall to the sides for a gentle hip stretch."
    },
    {
      "name": "Supine Twist",
      "description": "Lie on your back, bring one knee across your body to the opposite side to stretch your spine."
    },
    {
      "name": "Pelvic Tilts",
      "description": "Flatten your lower back into the bed by engaging your abs, then release. Great for core activation."
    },
    {
      "name": "Arm Circles",
      "description": "While lying down, extend arms to your sides and make small controlled circles to loosen shoulder joints."
    },
    {
      "name": "Scissor Kicks",
      "description": "Lift both legs slightly and alternate crossing them over and under each other. Engages the lower abs."
    }
  ],
  "sitting_exercises": [
    {
      "name": "Seated Marching",
      "description": "Lift your knees one at a time as if marching while sitting upright in a chair."
    },
    {
      "name": "Seated Torso Twists",
      "description": "Place hands behind your head and twist your upper body side to side for core rotation."
    },
    {
      "name": "Seated Leg Extensions",
      "description": "Extend one leg straight out and hold for a few seconds, then lower and repeat on the other side."
    },
    {
      "name": "Shoulder Rolls",
      "description": "Roll your shoulders forward and backward in circular motions to relieve tension."
    },
    {
      "name": "Neck Tilts",
      "description": "Slowly tilt your head toward each shoulder to stretch your neck."
    },
    {
      "name": "Seated Calf Raises",
      "description": "Lift your heels off the ground while keeping toes planted, then lower to strengthen calves."
    },
    {
      "name": "Arm Raises",
      "description": "Raise both arms overhead and lower them down repeatedly to improve shoulder mobility."
    },
    {
      "name": "Wrist Circles",
      "description": "Make slow circles with your wrists to improve flexibility and reduce stiffness."
    },
    {
      "name": "Ankle Rotations",
      "description": "Lift each foot slightly and rotate your ankles in circles to increase mobility."
    }
  ],
  "standing_exercises": [
    {
      "name": "Standing Marches",
      "description": "March in place by lifting your knees high to engage the legs and core."
    },
    {
      "name": "Standing Calf Raises",
      "description": "Stand tall and raise your heels off the ground, then lower back down. Strengthens the calves."
    },
    {
      "name": "Wall Push-Ups",
      "description": "Stand facing a wall and push off it as if doing a push-up. Works upper body with low impact."
    },
    {
      "name": "Side Leg Raises",
      "description": "Lift one leg out to the side, keeping it straight, then lower and repeat on the other side."
    },
    {
      "name": "Knee Lifts with Reach",
      "description": "Lift one knee and reach the opposite hand toward it to activate your core."
    },
    {
      "name": "Mini Squats",
      "description": "Lower your hips a few inches as if sitting in a chair, then rise back up. Strengthens thighs and glutes."
    },
    {
      "name": "Arm Circles",
      "description": "Extend your arms out to the sides and make small forward and backward circles."
    },
    {
      "name": "Toe Touches",
      "description": "Stand with feet shoulder-width apart, bend at the waist to touch your toes, then return upright."
    },
    {
      "name": "Heel-to-Toe Rocking",
      "description": "Shift your weight from your heels to your toes and back to improve balance and ankle strength."
    }
  ]
}
    self.used = {
      "bed_exercises": set(),
      "sitting_exercises": set(),
      "standing_exercises": set()
    }

    self.stop_now = False
    self.tseconds = 0


  def countdown(self, time_sec = 30, category = ""):
    self.get_random_exercise(category)
    while time_sec:
      # mins, secs = divmod(time_sec, 60)
      self.seconds.text = time_sec
      self.tseconds += 1
      self.total_seconds.text = str(self.tseconds)
      time.sleep(1)
      time_sec -= 1
      if self.stop_now:
        return
    self.countdown(category=category)
    
      
  def get_random_exercise(self, category):
    if category not in self.exercise_list:
      raise ValueError("Invalid category. Choose from: bed_exercises, sitting_exercises, standing_exercises")
  
    available = [i for i in range(len(self.exercise_list[category])) if i not in self.used[category]]
  
    if not available:
      self.used = {
        "bed_exercises": set(),
        "sitting_exercises": set(),
        "standing_exercises": set()
      }
      available = [i for i in range(len(self.exercise_list[category])) if i not in self.used[category]]
  
    choice_index = random.choice(available)
    self.used[category].add(choice_index)
    chosen = self.exercise_list[category][choice_index]

    self.title.text = chosen['name']
    self.explanation.text = chosen['description']
    

  def reset(self):    
    self.title.text = "Loading"
    self.explanation.text = "Prepare to exercise!"
    self.stop_now = True
    time.sleep(1)
    self.stop_now = False    
    self.used = {
      "bed_exercises": set(),
      "sitting_exercises": set(),
      "standing_exercises": set()
    }
    
  def bed_button_click(self, **event_args):
    self.reset()
    self.countdown(category = "bed_exercises")

  def sitting_button_click(self, **event_args):
    self.reset()
    self.countdown(category = "sitting_exercises")

  def standing_button_click(self, **event_args):
    self.reset()
    self.countdown(category = "standing_exercises")

  def sweaty_button_click(self, **event_args):
    self.stop_now = True
    self.title.text = "Exercise is stopped"
    self.explanation.text = "Again?"
    self.seconds.text = "0"
