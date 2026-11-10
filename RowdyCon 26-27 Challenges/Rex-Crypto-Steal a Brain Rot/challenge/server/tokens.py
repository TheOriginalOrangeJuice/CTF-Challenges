"""Signed-token issue/verify for the Steal-a-Brain-Rot CTF challenge.

After a player proves they recovered the Konami code (/arena/unlock), we issue a
short-lived itsdangerous-signed token. They redeem it at /complete for the flag.
This keeps flag release server-authoritative: the client never holds the flag,
and a token cannot be forged without the signing secret.
"""

import os

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

# Signing secret from env, with a random per-boot default if unset. A random
# default means tokens do not survive a restart, which is fine for a CTF
# instance and avoids shipping a predictable key.
_TOKEN_SECRET = os.environ.get("TOKEN_SECRET") or os.urandom(32).hex()

# Namespacing salt; purely to scope the signature to this use.
_SALT = "steal-a-brain-rot/unlock"

# Token lifetime in seconds (2 hours per the contract).
MAX_AGE_SECONDS = 2 * 60 * 60

_serializer = URLSafeTimedSerializer(_TOKEN_SECRET, salt=_SALT)


def issue_token() -> str:
    """Issue a signed, timestamped token proving the Konami code was recovered."""
    return _serializer.dumps({"unlocked": True})


def verify_token(token: str, max_age: int = MAX_AGE_SECONDS) -> bool:
    """Return True iff `token` is a valid, unexpired, correctly-signed token."""
    if not token or not isinstance(token, str):
        return False
    try:
        data = _serializer.loads(token, max_age=max_age)
    except (BadSignature, SignatureExpired, Exception):
        return False
    return bool(isinstance(data, dict) and data.get("unlocked") is True)
