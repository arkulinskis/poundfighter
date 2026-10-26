// Static game content: exercises, monsters, ranks, badges, shop items.

export const POSITIONS = {
  bed: { id: 'bed', label: "I'm in bed", short: 'Bed', habitat: 'bedroom' },
  sitting: { id: 'sitting', label: "I'm at my desk", short: 'Desk', habitat: 'office' },
  standing: { id: 'standing', label: "I'm standing", short: 'Standing', habitat: 'lounge' },
};

export const HABITATS = {
  bedroom: { id: 'bedroom', name: 'Bedroom', blurb: 'Lurks under duvets. Feeds on snooze buttons.', where: 'Fight in bed to find them.' },
  office: { id: 'office', name: 'Office', blurb: 'Hides in inboxes. Thrives on sitting still.', where: 'Fight at your desk to find them.' },
  lounge: { id: 'lounge', name: 'Lounge', blurb: 'Nests in sofas. Powered by autoplay.', where: 'Fight standing up to find them.' },
};

const NOISE = 'Grunt, clap or say "HUP!" on each rep';

// type: 'reps' -> target is a rep count; 'hold' -> target is seconds
export const EXERCISES = {
  bed: [
    { id: 'glute-bridge', name: 'Glute Bridges', type: 'reps', target: 12, desc: 'Knees bent, feet flat. Lift your hips, squeeze your glutes at the top, lower slowly.', cue: 'HUP at the top' },
    { id: 'leg-raise', name: 'Leg Raises', type: 'reps', target: 10, desc: 'On your back, lift one straight leg up to vertical, lower it, then the other leg. Each lift counts.', cue: NOISE },
    { id: 'pelvic-tilt', name: 'Pelvic Tilts', type: 'reps', target: 15, desc: 'Flatten your lower back into the mattress by tightening your abs, then release.', cue: 'Huff as you flatten' },
    { id: 'ankle-pump', name: 'Ankle Pumps', type: 'reps', target: 20, desc: 'Point your toes away, then pull them back toward you. Wake those calves up.', cue: 'Click your tongue on each pump' },
    { id: 'scissor', name: 'Scissor Kicks', type: 'reps', target: 16, desc: 'Lift both legs slightly and cross them over and under. Every cross is a rep.', cue: NOISE },
    { id: 'heel-slide', name: 'Heel Slides', type: 'reps', target: 12, desc: 'Slide one heel toward your bum, then slide it back out. Alternate legs.', cue: NOISE },
    { id: 'clamshell', name: 'Clamshells', type: 'reps', target: 12, desc: 'On your side, knees bent. Open your top knee like a clam, keep feet together, close.', cue: 'HUP as the clam opens' },
    { id: 'dead-bug', name: 'Dead Bugs', type: 'reps', target: 10, desc: 'Arms up, knees at 90°. Lower opposite arm and leg toward the bed, return, switch.', cue: NOISE },
    { id: 'pillow-squeeze', name: 'Pillow Squeeze', type: 'reps', target: 12, desc: 'Pillow between your knees. Squeeze hard for a second, release.', cue: 'Grunt on each squeeze' },
    { id: 'bed-bicycle', name: 'Lazy Bicycles', type: 'reps', target: 16, desc: 'Pedal your legs slowly in the air. Every push forward counts.', cue: NOISE },
    { id: 'glute-clench', name: 'Glute Clench', type: 'hold', target: 20, desc: 'Brain off, glutes on. Squeeze your glutes as hard as you can and hold.', cue: 'Just hold. The monster melts.' },
    { id: 'knee-hug', name: 'Knee Hug', type: 'hold', target: 20, desc: 'Pull both knees to your chest and hug them. Breathe into your lower back.', cue: 'Just hold. Breathe.' },
  ],
  sitting: [
    { id: 'seated-march', name: 'Seated Marching', type: 'reps', target: 20, desc: 'Sit tall and lift your knees one at a time like you are marching to a meeting.', cue: NOISE },
    { id: 'leg-extension', name: 'Leg Extensions', type: 'reps', target: 12, desc: 'Straighten one leg out in front, hold a beat, lower. Alternate legs.', cue: 'HUP when the leg is straight' },
    { id: 'seated-calf', name: 'Seated Calf Raises', type: 'reps', target: 20, desc: 'Feet flat, lift your heels as high as they go, lower down.', cue: NOISE },
    { id: 'shoulder-roll', name: 'Shoulder Rolls', type: 'reps', target: 12, desc: 'Big slow circles: shoulders up to ears, back, down. Undo the hunch.', cue: 'Sigh on each roll' },
    { id: 'torso-twist', name: 'Torso Twists', type: 'reps', target: 12, desc: 'Hands behind your head, twist to one side, then the other. Each twist is a rep.', cue: NOISE },
    { id: 'arm-raise', name: 'Overhead Reaches', type: 'reps', target: 12, desc: 'Reach both arms to the ceiling like you just won, lower them.', cue: '"YES!" at the top' },
    { id: 'blade-squeeze', name: 'Shoulder Blade Squeeze', type: 'reps', target: 12, desc: 'Pinch your shoulder blades together like you are holding a pencil between them.', cue: NOISE },
    { id: 'seated-crunch', name: 'Seated Knee Tucks', type: 'reps', target: 10, desc: 'Hold the chair edge, lean back slightly, pull both knees toward your chest.', cue: 'HUP on each tuck' },
    { id: 'desk-press', name: 'Desk Press', type: 'reps', target: 12, desc: 'Palms on the desk edge, press down hard for a second as if pushing it into the floor.', cue: 'Grunt on each press' },
    { id: 'glute-clench-seated', name: 'Secret Glute Squeeze', type: 'reps', target: 15, desc: 'Nobody will know. Squeeze your glutes, hold a second, release.', cue: 'Tiny "hup" if you are in an open office' },
    { id: 'leg-hold', name: 'Hover Legs', type: 'hold', target: 20, desc: 'Straighten both legs and hold them hovering off the floor.', cue: 'Just hold. The monster melts.' },
    { id: 'wall-of-posture', name: 'Posture Lock', type: 'hold', target: 25, desc: 'Sit tall, chin tucked, shoulders back and down, abs braced. Hold it.', cue: 'Just hold. Be a statue.' },
  ],
  standing: [
    { id: 'squat', name: 'Squats', type: 'reps', target: 12, desc: 'Feet shoulder-width, sit back like there is a chair, stand up tall.', cue: 'HUP on the way up' },
    { id: 'calf-raise', name: 'Calf Raises', type: 'reps', target: 20, desc: 'Rise up onto your toes, pause, lower slowly.', cue: NOISE },
    { id: 'desk-pushup', name: 'Desk Push-Ups', type: 'reps', target: 10, desc: 'Hands on a sturdy desk or wall, step back, lower your chest to it, push away.', cue: 'Grunt on each push' },
    { id: 'shadow-box', name: 'Shadow Boxing', type: 'reps', target: 20, desc: 'Fists up. Throw quick punches at the air. Every punch lands on the monster.', cue: 'Huff on every punch' },
    { id: 'march', name: 'High Knees March', type: 'reps', target: 20, desc: 'March on the spot, knees up high, arms pumping.', cue: NOISE },
    { id: 'side-leg', name: 'Side Leg Raises', type: 'reps', target: 12, desc: 'Hold something for balance, lift one leg out to the side, lower. Alternate.', cue: NOISE },
    { id: 'reverse-lunge', name: 'Reverse Lunges', type: 'reps', target: 10, desc: 'Step one foot back and lower your back knee toward the floor. Return, switch.', cue: 'HUP as you step back up' },
    { id: 'good-morning', name: 'Good Mornings', type: 'reps', target: 12, desc: 'Hands on hips, hinge forward with a flat back, then stand tall and squeeze glutes.', cue: '"Good morning!" each time' },
    { id: 'standing-crunch', name: 'Standing Crunches', type: 'reps', target: 12, desc: 'Lift one knee and bring the opposite elbow to meet it. Alternate.', cue: NOISE },
    { id: 'quiet-jacks', name: 'Quiet Jacks', type: 'reps', target: 20, desc: 'Step one foot out while raising your arms, step back in. Jumping jacks, neighbour-friendly.', cue: 'Clap overhead' },
    { id: 'wall-sit', name: 'Wall Sit', type: 'hold', target: 30, desc: 'Back flat against a wall, slide down until your knees bend. Hold.', cue: 'Just hold. The monster melts.' },
    { id: 'statue', name: 'Flamingo Balance', type: 'hold', target: 20, desc: 'Stand on one leg, arms out. Switch legs halfway through.', cue: 'Just hold. Be the flamingo.' },
  ],
};

export const RARITIES = {
  common: { id: 'common', name: 'Common', weight: 62, bonusReps: 0, pounds: 10, xp: 20 },
  rare: { id: 'rare', name: 'Rare', weight: 25, bonusReps: 0, pounds: 25, xp: 40 },
  epic: { id: 'epic', name: 'Epic', weight: 10, bonusReps: 2, pounds: 60, xp: 80 },
  legendary: { id: 'legendary', name: 'Legendary', weight: 3, bonusReps: 4, pounds: 150, xp: 200 },
};
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];

const m = (id, name, habitat, rarity, flavor) => ({ id, name, habitat, rarity, flavor });

export const MONSTERS = [
  // Bedroom
  m('snooze-goblin', 'Snooze Goblin', 'bedroom', 'common', 'Hits snooze for you. Nine times.'),
  m('pillow-imp', 'Pillow Imp', 'bedroom', 'common', 'Whispers "just five more" into your ear.'),
  m('sock-mimic', 'Sock Mimic', 'bedroom', 'common', 'Disguises itself as the sock you cannot find.'),
  m('lint-bunny', 'Lint Bunny', 'bedroom', 'common', 'Breeds under the bed at an alarming rate.'),
  m('drool-sprite', 'Drool Sprite', 'bedroom', 'common', 'Leaves a damp patch as a calling card.'),
  m('blanket-slug', 'Blanket Slug', 'bedroom', 'common', 'Moves 2cm per hour. Proud of it.'),
  m('duvet-dragonling', 'Duvet Dragonling', 'bedroom', 'rare', 'Hoards warmth. Breathes cozy.'),
  m('alarm-gremlin', 'Alarm Gremlin', 'bedroom', 'rare', 'Turns off alarms and then forgets it did.'),
  m('midnight-snackrat', 'Midnight Snackrat', 'bedroom', 'rare', 'Leaves crumbs in your sheets. Never apologises.'),
  m('five-more-minutes', 'The Five-More-Minutes', 'bedroom', 'epic', 'A time-bending horror. Five minutes is never five minutes.'),
  m('doomscroll-wraith', 'Doomscroll Wraith', 'bedroom', 'epic', 'Glows blue at 1am. Feeds on thumbs.'),
  m('king-hibernus', 'King Hibernus', 'bedroom', 'legendary', 'Ruler of the Long Lie-In. Has not stood up since 2019.'),
  // Office
  m('desk-slug', 'Desk Slug', 'office', 'common', 'Fuses with your chair after 3 hours.'),
  m('stapler-crab', 'Stapler Crab', 'office', 'common', 'Pinches paperwork. And fingers.'),
  m('cable-snake', 'Cable Snake', 'office', 'common', 'Ties itself into knots you cannot undo.'),
  m('coffee-drip', 'Coffee Drip', 'office', 'common', 'Jittery. Lukewarm. Always there.'),
  m('postit-moth', 'Post-it Moth', 'office', 'common', 'Flutters around reminding you of nothing.'),
  m('inbox-blob', 'Inbox Blob', 'office', 'common', 'Grows by one every time you look away.'),
  m('spreadsheet-spider', 'Spreadsheet Spider', 'office', 'rare', 'Weaves pivot tables. Nobody knows how they work.'),
  m('printer-poltergeist', 'Printer Poltergeist', 'office', 'rare', 'PC LOAD LETTER. Forever.'),
  m('swivel-djinn', 'Swivel Chair Djinn', 'office', 'rare', 'Grants three spins. Then you have to work.'),
  m('meeting-kraken', 'Meeting Kraken', 'office', 'epic', 'Every tentacle is a recurring calendar invite.'),
  m('reply-all-hydra', 'Reply-All Hydra', 'office', 'epic', 'Cut off one thread, two more appear.'),
  m('the-deadline', 'The Deadline', 'office', 'legendary', 'It was always closer than it appeared.'),
  // Lounge
  m('couch-potato', 'Couch Potato', 'lounge', 'common', 'The original. Starchy. Unbothered.'),
  m('remote-gremlin', 'Remote Gremlin', 'lounge', 'common', 'Hides the remote, then watches you search.'),
  m('crumb-mite', 'Crumb Mite', 'lounge', 'common', 'Lives in the sofa cracks. Eats well.'),
  m('dust-bunny', 'Dust Bunny', 'lounge', 'common', 'Cute until it unionises.'),
  m('cushion-toad', 'Cushion Toad', 'lounge', 'common', 'Squishy. Sticky. Hard to get off.'),
  m('phantom-sub', 'Phantom Subscription', 'lounge', 'common', 'You forgot it existed. It did not forget you.'),
  m('snack-goblin', 'Snack Goblin', 'lounge', 'rare', 'Opens the fridge just to look. Again.'),
  m('autoplay-phantom', 'Autoplay Phantom', 'lounge', 'rare', 'Next episode in 5... 4... 3...'),
  m('recliner-troll', 'Recliner Troll', 'lounge', 'rare', 'Demands a toll of one whole afternoon.'),
  m('binge-beast', 'Binge Beast', 'lounge', 'epic', 'Ate eight seasons in one sitting. Still hungry.'),
  m('takeaway-titan', 'Takeaway Titan', 'lounge', 'epic', 'Summoned by three taps and a weak moment.'),
  m('sofa-king', 'The Sofa King', 'lounge', 'legendary', 'Sofa king comfortable. Sofa king hard to beat.'),
];

export const MONSTER_BY_ID = Object.fromEntries(MONSTERS.map((x) => [x.id, x]));

// Card tiers by how many times a monster has been caught
export const CARD_TIERS = [
  { min: 15, id: 'gold', name: 'Gold' },
  { min: 7, id: 'silver', name: 'Silver' },
  { min: 3, id: 'bronze', name: 'Bronze' },
  { min: 1, id: 'base', name: '' },
];
export const tierFor = (count) => CARD_TIERS.find((t) => count >= t.min) || null;

export const RANKS = [
  { level: 1, name: 'Couch Potato' },
  { level: 3, name: 'Desk Dabbler' },
  { level: 5, name: 'Stair Taker' },
  { level: 8, name: 'Office Brawler' },
  { level: 12, name: 'Cubicle Gladiator' },
  { level: 16, name: 'Pound Hunter' },
  { level: 20, name: 'Iron Intern' },
  { level: 25, name: 'Boardroom Beast' },
  { level: 30, name: 'PoundFighter Legend' },
];

export const SESSION_LENGTHS = [
  { id: 1, name: 'Quick hit', fights: 1, hint: '~1 min' },
  { id: 3, name: 'Coffee break', fights: 3, hint: '~3 min' },
  { id: 5, name: 'Lunch brawl', fights: 5, hint: '~5 min' },
];

export const BADGES = [
  { id: 'first-blood', name: 'First Blood', desc: 'Land your first rep.' },
  { id: 'centurion', name: 'Centurion', desc: '100 reps, all time.' },
  { id: 'thousand', name: 'Thousand Pounder', desc: '1,000 reps, all time.' },
  { id: 'loud', name: 'Loud & Proud', desc: '100 reps counted by voice.' },
  { id: 'collector', name: 'Collector', desc: 'Capture 10 different monsters.' },
  { id: 'habitat-hero', name: 'Habitat Hero', desc: 'Complete any habitat.' },
  { id: 'all', name: "Gotta Pound 'Em All", desc: 'Capture every monster.' },
  { id: 'legend', name: 'Legend Slayer', desc: 'Capture a Legendary.' },
  { id: 'week', name: 'Week Warrior', desc: 'Reach a 7-day streak.' },
  { id: 'full-card', name: 'Full Card', desc: 'Fill all 8 punches in one day.' },
  { id: 'combo', name: 'Combo King', desc: 'Hit a 15× combo.' },
  { id: 'early', name: 'Early Bird', desc: 'Fight before 8am.' },
  { id: 'owl', name: 'Night Owl', desc: 'Fight after 10pm.' },
  { id: 'gold-card', name: 'Gold Standard', desc: 'Get any monster card to Gold (15 catches).' },
];

export const LURES = [
  { id: 'lure-rare', name: 'Rare Lure', rarity: 'rare', price: 60, desc: 'Your next monster is Rare or better.' },
  { id: 'lure-epic', name: 'Epic Lure', rarity: 'epic', price: 160, desc: 'Your next monster is Epic or better.' },
  { id: 'lure-legendary', name: 'Legendary Lure', rarity: 'legendary', price: 420, desc: 'Your next monster is Legendary.' },
];

export const ARENAS = [
  { id: 'dojo', name: 'Rust Dojo', price: 0 },
  { id: 'neon', name: 'Neon Office', price: 120 },
  { id: 'sunset', name: 'Sunset Rooftop', price: 220 },
  { id: 'space', name: 'Deep Space', price: 380 },
  { id: 'gold', name: 'Golden Colosseum', price: 650 },
];

// Daily quest templates. `metric` reads from today's day-record.
export const QUEST_TEMPLATES = [
  { type: 'reps', metric: 'reps', targets: [30, 50, 80], text: (n) => `Pound out ${n} reps`, reward: 40 },
  { type: 'captures', metric: 'captures', targets: [3, 5, 8], text: (n) => `Capture ${n} monsters`, reward: 40 },
  { type: 'punches', metric: 'punches', targets: [2, 3, 4], text: (n) => `Punch the card in ${n} different hours`, reward: 60 },
  { type: 'micReps', metric: 'micReps', targets: [20, 40], text: (n) => `Land ${n} reps by voice`, reward: 40 },
  { type: 'rare', metric: 'rareCaptures', targets: [1], text: () => 'Capture a Rare or better', reward: 50 },
  { type: 'combo', metric: 'maxCombo', targets: [6, 10], text: (n) => `Hit a ${n}× combo`, reward: 40 },
  { type: 'habitat-bedroom', metric: 'cap:bedroom', targets: [2], text: (n) => `Capture ${n} Bedroom monsters`, reward: 40 },
  { type: 'habitat-office', metric: 'cap:office', targets: [2], text: (n) => `Capture ${n} Office monsters`, reward: 40 },
  { type: 'habitat-lounge', metric: 'cap:lounge', targets: [2], text: (n) => `Capture ${n} Lounge monsters`, reward: 40 },
];

export const PUNCH_SLOTS = 8;
export const CHESTS = [
  { at: 4, pounds: 50, xp: 60, lure: null, name: 'Half-card chest' },
  { at: 8, pounds: 150, xp: 200, lure: 'lure-epic', name: 'Full-card chest' },
];
