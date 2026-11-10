"""AES-ECB encryption oracle for the Steal-a-Brain-Rot CTF challenge.

This module implements the server side of the cryptopals-12
"byte-at-a-time ECB decryption" puzzle. It exposes an oracle that encrypts

    AES_ECB( PKCS7_pad( attacker_bytes + SECRET ) )

under a fixed, per-instance random 16-byte key. The key is generated ONCE at
import time (process start) and is never exposed through any endpoint, so the
ciphertext for a given attacker prefix is deterministic for the life of the
process -- which is exactly what makes the byte-at-a-time attack work.

SECRET ends in the ancient code (a deliberately NON-default arrow sequence, not
the famous Konami code, so players cannot just guess it); recovering SECRET via
the oracle is the intended path to unlocking the boss fight.
"""

from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes

# Block size for AES-128 (always 16 bytes).
BLOCK_SIZE = 16

# The secret appended after the attacker-controlled prefix. Its tail is the
# ancient code the player must recover and submit to /arena/unlock. This is
# intentionally NOT the real Konami code (UUDDLRLRBA) -- a custom arrow sequence
# so the only way to learn it is to break the ECB oracle, not guess.
SECRET = b"K0N4MI_C0D3=DRULBADLUR"

# The code tail that /arena/unlock compares against (constant-time).
KONAMI_CODE = "DRULBADLUR"

# Fixed per-instance random AES key. Generated ONCE at module load so the oracle
# is stable for the whole process lifetime. NEVER exposed via any endpoint.
_KEY = get_random_bytes(BLOCK_SIZE)


def _pkcs7_pad(data: bytes, block_size: int = BLOCK_SIZE) -> bytes:
    """Pad `data` to a multiple of `block_size` using PKCS#7."""
    pad_len = block_size - (len(data) % block_size)
    return data + bytes([pad_len]) * pad_len


def encryption_oracle(attacker_bytes: bytes) -> bytes:
    """Return AES_ECB_encrypt(PKCS7_pad(attacker_bytes + SECRET)).

    This is the single function the HTTP oracle endpoint wraps. The attacker
    controls the prefix; SECRET and the key are fixed server-side.
    """
    cipher = AES.new(_KEY, AES.MODE_ECB)
    return cipher.encrypt(_pkcs7_pad(attacker_bytes + SECRET))


def split_blocks(data: bytes, block_size: int = BLOCK_SIZE):
    """Split bytes into a list of block-sized chunks (for the hint mode)."""
    return [data[i:i + block_size] for i in range(0, len(data), block_size)]
