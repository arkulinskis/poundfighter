"""PoundFighter server: accounts, progress sync, feedback inbox and push reminders.

The game itself runs in the browser (theme/assets/app). The Main form relays
calls from the game to the functions below.
"""
import json
import random
from datetime import datetime, timedelta, timezone

import anvil.server
import anvil.users
from anvil.tables import app_tables

from . import push

MAX_PROGRESS_BYTES = 300_000
MAX_FEEDBACK_CHARS = 4000
FEEDBACK_PER_SESSION = 15
FEEDBACK_STATUSES = ['new', 'reviewing', 'fixed', 'wontfix']


def _now():
  return datetime.now(timezone.utc)


def _is_admin(user):
  return bool(user and user['is_admin'])


def _require_admin():
  user = anvil.users.get_user()
  if not _is_admin(user):
    raise anvil.server.PermissionDenied('Admins only')
  return user


# ---------------------------------------------------------------- account

@anvil.server.callable
def get_account():
  user = anvil.users.get_user()
  if not user:
    return None
  return {'email': user['email'], 'is_admin': _is_admin(user)}


@anvil.server.callable(require_user=True)
def change_password(old_password, new_password):
  """Check the old password, then store a new bcrypt hash (Anvil's format)."""
  if not isinstance(new_password, str) or len(new_password) < 8:
    raise ValueError('New password must be at least 8 characters.')
  try:
    import bcrypt
  except ImportError:
    raise RuntimeError('ResetByEmail')
  user = anvil.users.get_user()
  stored = user['password_hash'] or ''
  if not stored.startswith('$2'):
    raise RuntimeError('ResetByEmail')
  if not bcrypt.checkpw(old_password.encode('utf-8'), stored.encode('utf-8')):
    raise anvil.users.AuthenticationFailed('Current password is wrong.')
  user['password_hash'] = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
  return True


# ---------------------------------------------------------------- progress

def _max_num(a, b):
  nums = [x for x in (a, b) if isinstance(x, (int, float)) and not isinstance(x, bool)]
  return max(nums) if nums else (a if a is not None else b)


def _merge_max_dict(a, b):
  out = dict(a or {})
  for k, v in (b or {}).items():
    out[k] = _max_num(out.get(k), v)
  return out


def _merge_days(a, b):
  out = {}
  for key in set(a or {}) | set(b or {}):
    x, y = (a or {}).get(key), (b or {}).get(key)
    if not x or not y:
      out[key] = x or y
      continue
    d = dict(y)
    for k in ('reps', 'micReps', 'captures', 'rareCaptures', 'maxCombo', 'sessions'):
      d[k] = _max_num(x.get(k), y.get(k)) or 0
    d['punches'] = sorted(set(x.get('punches') or []) | set(y.get('punches') or []))[:8]
    d['habitat'] = _merge_max_dict(x.get('habitat'), y.get('habitat'))
    d['chests'] = {k: True for k in set(x.get('chests') or {}) | set(y.get('chests') or {})}
    qx, qy = x.get('quests') or [], y.get('quests') or []
    if len(qx) == len(qy):
      d['quests'] = [dict(q2, claimed=bool(q1.get('claimed') or q2.get('claimed'))) for q1, q2 in zip(qx, qy)]
    out[key] = d
  for k in sorted(out)[:-21]:
    del out[k]
  return out


def merge_progress(stored, incoming):
  """Combine two copies of a player's progress without losing anything.

  Counters only ever go up, so taking the larger value is safe. Preferences
  (settings, chosen arena, armed lure) come from `incoming`, the device that
  is syncing right now. Mirrors mergeStates() in theme/assets/app/js/store.js.
  """
  if not stored:
    return incoming
  if not incoming:
    return stored
  a, b = stored, incoming
  out = dict(b)
  for k in ('xp', 'earned', 'spent', 'bestCombo', 'lastSessionAt'):
    out[k] = _max_num(a.get(k), b.get(k)) or 0
  for k in ('totals', 'caught', 'lureBought', 'lureUsed'):
    out[k] = _merge_max_dict(a.get(k), b.get(k))
  for k in ('firstCaught', 'badges'):
    merged = dict(a.get(k) or {})
    for key, day in (b.get(k) or {}).items():
      merged[key] = min(merged[key], day) if key in merged else day
    out[k] = merged
  sa, sb = a.get('streak') or {}, b.get('streak') or {}
  out['streak'] = sa if (sa.get('last') or '') > (sb.get('last') or '') else (
    sb if (sb.get('last') or '') > (sa.get('last') or '') else
    {'last': sb.get('last'), 'count': _max_num(sa.get('count'), sb.get('count')) or 0})
  out['arenas'] = sorted(set(a.get('arenas') or []) | set(b.get('arenas') or []))
  out['days'] = _merge_days(a.get('days'), b.get('days'))
  return out


@anvil.server.callable(require_user=True)
def sync_progress(data=None):
  """Merge the device's progress into the account copy and return the result.

  Call with data=None to just read the account copy.
  """
  user = anvil.users.get_user()
  row = app_tables.progress.get(user=user)
  stored = row['data'] if row else None
  if data is None:
    return stored
  if not isinstance(data, dict) or len(json.dumps(data)) > MAX_PROGRESS_BYTES:
    raise ValueError('Progress data is invalid or too large')
  merged = merge_progress(stored, data)
  merged['owner'] = user['email']
  if row:
    row.update(data=merged, updated=_now())
  else:
    app_tables.progress.add_row(user=user, data=merged, updated=_now())
  return merged


# ---------------------------------------------------------------- feedback

@anvil.server.callable
def submit_feedback(kind, message, email=None, context=None):
  message = (message or '').strip()
  if not message:
    raise ValueError('Please write a message.')
  count = anvil.server.session.get('fb_count', 0)
  if count >= FEEDBACK_PER_SESSION:
    raise ValueError('Thanks, that is plenty of feedback for now!')
  anvil.server.session['fb_count'] = count + 1
  user = anvil.users.get_user()
  ctx = context if isinstance(context, dict) else {}
  if len(json.dumps(ctx)) > 5000:
    ctx = {'note': 'context too large'}
  app_tables.feedback.add_row(
    user=user,
    email=(user['email'] if user else (email or '').strip()[:200]) or None,
    kind=kind if kind in ('bug', 'idea', 'other') else 'other',
    message=message[:MAX_FEEDBACK_CHARS],
    context=ctx,
    created=_now(),
    status='new',
    admin_note='',
  )
  return True


def _feedback_dict(row):
  return {
    'id': row.get_id(),
    'created': row['created'].isoformat() if row['created'] else None,
    'email': row['email'],
    'kind': row['kind'],
    'message': row['message'],
    'context': row['context'] or {},
    'status': row['status'] or 'new',
    'admin_note': row['admin_note'] or '',
  }


@anvil.server.callable
def admin_list_feedback(status=None):
  _require_admin()
  rows = app_tables.feedback.search(status=status) if status else app_tables.feedback.search()
  items = sorted((_feedback_dict(r) for r in rows), key=lambda x: x['created'] or '', reverse=True)
  counts = {s: len(app_tables.feedback.search(status=s)) for s in FEEDBACK_STATUSES}
  return {'items': items[:300], 'counts': counts, 'players': len(app_tables.users.search())}


@anvil.server.callable
def admin_update_feedback(item_id, status=None, admin_note=None):
  _require_admin()
  row = app_tables.feedback.get_by_id(item_id)
  if not row:
    raise ValueError('Not found')
  if status in FEEDBACK_STATUSES:
    row['status'] = status
  if admin_note is not None:
    row['admin_note'] = str(admin_note)[:2000]
  return _feedback_dict(row)


@anvil.server.callable
def admin_delete_feedback(item_id):
  _require_admin()
  row = app_tables.feedback.get_by_id(item_id)
  if row:
    row.delete()
  return True


# ---------------------------------------------------------------- push reminders

DEFAULT_PREFS = {'on': True, 'start': 9, 'end': 17, 'every': 60, 'weekdays': True}


def _clean_prefs(prefs):
  p = dict(DEFAULT_PREFS)
  for k in p:
    if isinstance(prefs, dict) and k in prefs:
      p[k] = prefs[k]
  p['start'] = max(0, min(23, int(p['start'])))
  p['end'] = max(p['start'] + 1, min(24, int(p['end'])))
  p['every'] = max(30, min(240, int(p['every'])))
  p['on'] = bool(p['on'])
  p['weekdays'] = bool(p['weekdays'])
  return p


@anvil.server.callable
def push_public_key():
  return push.public_key()


@anvil.server.callable
def push_subscribe(subscription, prefs=None, tz_offset=0):
  if not isinstance(subscription, dict) or not str(subscription.get('endpoint', '')).startswith('https://'):
    raise ValueError('Invalid subscription')
  keys = subscription.get('keys') or {}
  if not keys.get('p256dh') or not keys.get('auth'):
    raise ValueError('Invalid subscription keys')
  user = anvil.users.get_user()
  row = app_tables.push_subscriptions.get(endpoint=subscription['endpoint'])
  values = dict(keys=keys, prefs=_clean_prefs(prefs), tz_offset=int(tz_offset or 0), fails=0)
  if user:
    values['user'] = user
  if row:
    row.update(**values)
  else:
    app_tables.push_subscriptions.add_row(endpoint=subscription['endpoint'], created=_now(), **values)
  return True


@anvil.server.callable
def push_update(endpoint, prefs=None, tz_offset=None):
  row = app_tables.push_subscriptions.get(endpoint=endpoint)
  if not row:
    return False
  if prefs is not None:
    row['prefs'] = _clean_prefs(prefs)
  if tz_offset is not None:
    row['tz_offset'] = int(tz_offset)
  return True


@anvil.server.callable
def push_unsubscribe(endpoint):
  row = app_tables.push_subscriptions.get(endpoint=endpoint)
  if row:
    row.delete()
  return True


@anvil.server.callable
def push_activity(endpoint):
  """The player just worked out: hold off the next reminder."""
  row = app_tables.push_subscriptions.get(endpoint=endpoint)
  if row:
    row['last_active'] = _now()
  return True


@anvil.server.callable
def push_test(endpoint):
  row = app_tables.push_subscriptions.get(endpoint=endpoint)
  if not row:
    raise ValueError('Reminders are not set up on this device yet.')
  count = anvil.server.session.get('push_tests', 0)
  if count >= 5:
    raise ValueError('That is enough test notifications for now.')
  anvil.server.session['push_tests'] = count + 1
  status = push.send(row['endpoint'], row['keys'], {
    'title': 'PoundFighter reminders are on!',
    'body': 'This is what a nudge looks like. Brain off, glutes on.',
    'url': '/',
  })
  if status not in (200, 201, 202):
    raise ValueError('The push service said %s. Try turning reminders off and on again.' % status)
  return True


MONSTER_NAMES = [
  'Snooze Goblin', 'Pillow Imp', 'Sock Mimic', 'Lint Bunny', 'Desk Slug', 'Stapler Crab', 'Cable Snake',
  'Coffee Drip', 'Inbox Blob', 'Couch Potato', 'Remote Gremlin', 'Crumb Mite', 'Dust Bunny', 'Snack Goblin',
  'Spreadsheet Spider', 'Printer Poltergeist', 'Autoplay Phantom', 'Meeting Kraken',
]


def _reminder_message(row, local_now):
  name = random.choice(MONSTER_NAMES)
  body = random.choice([
    'One quick fight. Grunt your reps, catch it, back to work.',
    '60 seconds to catch it. Brain off, glutes on.',
    'Your glutes called. They want a word.',
    'It is feeding on your sitting time. Go get it.',
  ])
  user = row['user']
  if user:
    prog = app_tables.progress.get(user=user)
    data = prog['data'] if prog else None
    today = local_now.strftime('%Y-%m-%d')
    streak = (data or {}).get('streak') or {}
    if streak.get('count', 0) >= 2 and streak.get('last') != today:
      body = 'Your %d-day streak needs one fight today.' % streak['count']
  return {'title': 'A wild %s appeared!' % name, 'body': body, 'url': '/', 'tag': 'pf-reminder'}


@anvil.server.background_task
def send_reminders():
  """Run every 15 minutes as a Scheduled Task (set up in the Anvil editor)."""
  now = _now()
  sent = removed = 0
  for row in app_tables.push_subscriptions.search():
    prefs = _clean_prefs(row['prefs'])
    if not prefs['on']:
      continue
    local_now = now - timedelta(minutes=row['tz_offset'] or 0)
    if prefs['weekdays'] and local_now.weekday() >= 5:
      continue
    if not (prefs['start'] <= local_now.hour < prefs['end']):
      continue
    last = max(t for t in (row['last_sent'], row['last_active'], row['created'], now - timedelta(days=30)) if t)
    if now - last < timedelta(minutes=prefs['every']):
      continue
    status = push.send(row['endpoint'], row['keys'], _reminder_message(row, local_now))
    if status in (404, 410):
      row.delete()  # the browser dropped this subscription
      removed += 1
    elif status in (200, 201, 202):
      row.update(last_sent=now, fails=0)
      sent += 1
    else:
      fails = (row['fails'] or 0) + 1
      if fails >= 10:
        row.delete()
        removed += 1
      else:
        row.update(fails=fails, last_sent=now)
  print('Reminders sent: %d, removed: %d' % (sent, removed))
