"""Minimal Web Push sender (RFC 8291 encryption + RFC 8292 VAPID).

Uses only `cryptography` and `requests`, which ship with Anvil's Full Python 3
environment. The VAPID key pair is created on first use and kept in the
app_settings table, so there is nothing to configure.
"""
import base64
import json
import os
import struct
import time
from urllib.parse import urlparse

import requests
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

VAPID_SUBJECT = 'https://poundfighter.com'


def b64u(data):
  return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def unb64u(text):
  text = text.strip()
  return base64.urlsafe_b64decode(text + '=' * (-len(text) % 4))


def _public_bytes(key):
  return key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)


def _hkdf(salt, ikm, info, length):
  return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=info, backend=default_backend()).derive(ikm)


_cached_key = None


def _vapid_key():
  """Load the VAPID private key, creating and storing it on first use."""
  global _cached_key
  if _cached_key:
    return _cached_key
  from anvil.tables import app_tables
  row = app_tables.app_settings.get(key='vapid')
  if row:
    pem = row['value']['private_pem'].encode('ascii')
    key = serialization.load_pem_private_key(pem, password=None, backend=default_backend())
  else:
    key = ec.generate_private_key(ec.SECP256R1(), default_backend())
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    app_tables.app_settings.add_row(key='vapid', value={'private_pem': pem.decode('ascii'), 'public': b64u(_public_bytes(key))})
  _cached_key = key
  return key


def public_key():
  return b64u(_public_bytes(_vapid_key()))


def vapid_header(endpoint, key=None, now=None):
  key = key or _vapid_key()
  url = urlparse(endpoint)
  claims = {'aud': '%s://%s' % (url.scheme, url.netloc), 'exp': int((now or time.time()) + 12 * 3600), 'sub': VAPID_SUBJECT}
  signing_input = b64u(json.dumps({'typ': 'JWT', 'alg': 'ES256'}, separators=(',', ':')).encode()) + '.' + \
    b64u(json.dumps(claims, separators=(',', ':')).encode())
  r, s = decode_dss_signature(key.sign(signing_input.encode('ascii'), ec.ECDSA(hashes.SHA256())))
  jwt = signing_input + '.' + b64u(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))
  return 'vapid t=%s, k=%s' % (jwt, b64u(_public_bytes(key)))


def encrypt(payload, p256dh, auth, salt=None, server_key=None):
  """Encrypt a payload for one subscription (aes128gcm, single record)."""
  ua_public = unb64u(p256dh)
  auth_secret = unb64u(auth)
  server_key = server_key or ec.generate_private_key(ec.SECP256R1(), default_backend())
  as_public = _public_bytes(server_key)
  peer = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public)
  ecdh_secret = server_key.exchange(ec.ECDH(), peer)
  ikm = _hkdf(auth_secret, ecdh_secret, b'WebPush: info\x00' + ua_public + as_public, 32)
  salt = salt or os.urandom(16)
  cek = _hkdf(salt, ikm, b'Content-Encoding: aes128gcm\x00', 16)
  nonce = _hkdf(salt, ikm, b'Content-Encoding: nonce\x00', 12)
  ciphertext = AESGCM(cek).encrypt(nonce, payload + b'\x02', None)
  header = salt + struct.pack('!IB', 4096, len(as_public)) + as_public
  return header + ciphertext


def send(endpoint, keys, message, ttl=3600):
  """Send one notification. Returns the push service's HTTP status code."""
  body = encrypt(json.dumps(message).encode('utf-8'), keys['p256dh'], keys['auth'])
  try:
    resp = requests.post(endpoint, data=body, timeout=10, headers={
      'Authorization': vapid_header(endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': str(ttl),
      'Urgency': 'normal',
    })
    return resp.status_code
  except requests.RequestException as e:
    print('Push failed for %s: %s' % (endpoint[:60], e))
    return 0
