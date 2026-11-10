#!/usr/bin/env python3
"""AUTHOR SOLVER -- do not ship to players.

Reference solver for the Steal-a-Brain-Rot CTF challenge (cryptopals-12,
"byte-at-a-time ECB decryption"). It talks ONLY to the remote oracle over HTTP
using the Python standard library -- it never does any AES itself. It:

  1. detects the oracle's block size,
  2. confirms the mode is ECB (identical plaintext blocks -> identical
     ciphertext blocks),
  3. recovers the server-side SECRET one byte at a time via the classic
     aligned-block dictionary attack,
  4. extracts the Konami tail, unlocks to get a signed token, and redeems the
     token for the flag.

Usage:
    python3 solve.py [base_url]        # default http://localhost:8080

Stdlib only: urllib, json, base64, binascii. No pip packages.
"""

import base64
import binascii
import json
import sys
import urllib.error
import urllib.parse
import urllib.request


class Oracle:
    """Thin HTTP client for the challenge endpoints."""

    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")

    def encrypt(self, prefix: bytes) -> bytes:
        """Call GET /arena/oracle with `prefix`, return raw ciphertext bytes.

        The prefix is sent as URL-safe base64 (the frozen contract). The server
        returns hex, which we decode back to bytes here.
        """
        data_b64 = base64.urlsafe_b64encode(prefix).decode("ascii")
        url = self.base_url + "/arena/oracle?" + urllib.parse.urlencode({"data": data_b64})
        with urllib.request.urlopen(url, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        return binascii.unhexlify(body["ciphertext_hex"])

    def unlock(self, code: str):
        """POST /arena/unlock, return (ok, token)."""
        body = self._post_json("/arena/unlock", {"code": code})
        return bool(body.get("ok")), body.get("token")

    def complete(self, token: str):
        """POST /complete, return (ok, flag)."""
        body = self._post_json("/complete", {"token": token})
        return bool(body.get("ok")), body.get("flag")

    def _post_json(self, path, payload):
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            self.base_url + path,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            # 403 responses still carry a JSON body we want to read.
            return json.loads(err.read().decode("utf-8"))


def detect_block_size(oracle: Oracle) -> int:
    """Detect the block size by watching when the ciphertext length jumps.

    Feed increasingly long prefixes of a constant byte. The ciphertext length
    stays flat, then jumps by exactly one block when our prefix crosses a
    padding boundary. The size of that jump is the block size.
    """
    base_len = len(oracle.encrypt(b""))
    for n in range(1, 64):
        new_len = len(oracle.encrypt(b"A" * n))
        if new_len != base_len:
            return new_len - base_len
    raise RuntimeError("could not detect block size")


def confirm_ecb(oracle: Oracle, block_size: int) -> bool:
    """Confirm ECB: two identical plaintext blocks -> two identical ct blocks.

    We submit several identical blocks of the same byte. Under ECB the leading
    ciphertext blocks will repeat; under a chaining mode (e.g. CBC) they won't.
    """
    ct = oracle.encrypt(b"A" * (block_size * 4))
    blocks = [ct[i:i + block_size] for i in range(0, len(ct), block_size)]
    # At least two adjacent blocks must be equal somewhere in the prefix region.
    return any(blocks[i] == blocks[i + 1] for i in range(len(blocks) - 1))


def secret_length(oracle: Oracle, block_size: int) -> int:
    """Compute the length of the appended SECRET.

    With prefix length p the ciphertext length first grows when p + len(SECRET)
    becomes a multiple of block_size (a full extra pad block appears). At that
    smallest p, len(SECRET) = base_len - p.
    """
    base_len = len(oracle.encrypt(b""))
    for p in range(1, block_size + 1):
        if len(oracle.encrypt(b"A" * p)) != base_len:
            return base_len - p
    raise RuntimeError("could not determine secret length")


def recover_secret(oracle: Oracle, block_size: int, secret_len: int) -> bytes:
    """Recover SECRET byte-by-byte using the aligned-block dictionary attack.

    For target byte index i we send a filler so that byte sits as the LAST byte
    of some block. We capture that target block, then try all 256 bytes for the
    final position (filler + known-so-far + guess) and match the block.
    """
    recovered = bytearray()
    for i in range(secret_len):
        block_index = i // block_size
        # Filler so the next unknown byte lands at the end of block_index.
        filler = b"A" * (block_size - 1 - (i % block_size))

        target_ct = oracle.encrypt(filler)
        target_block = target_ct[block_index * block_size:(block_index + 1) * block_size]

        # The known window is the last (block_size - 1) bytes before the guess.
        found = None
        for guess in range(256):
            probe = filler + bytes(recovered) + bytes([guess])
            probe_ct = oracle.encrypt(probe)
            probe_block = probe_ct[block_index * block_size:(block_index + 1) * block_size]
            if probe_block == target_block:
                found = guess
                break
        if found is None:
            # Hit PKCS7 padding roll-over at the very end; stop cleanly.
            break
        recovered.append(found)
    return bytes(recovered)


def extract_konami(secret: str) -> str:
    """Pull the Konami tail out of the recovered SECRET string."""
    # SECRET looks like "K0N4MI_C0D3=DRULBADLUR"; the code is after the '='.
    if "=" in secret:
        return secret.rsplit("=", 1)[-1]
    return secret[-10:]


def main():
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
    oracle = Oracle(base_url)
    print(f"[*] Target: {base_url}")

    block_size = detect_block_size(oracle)
    print(f"[*] Detected block size: {block_size}")

    if not confirm_ecb(oracle, block_size):
        print("[!] Oracle does not look like ECB -- aborting.")
        sys.exit(1)
    print("[*] Confirmed ECB mode (identical plaintext blocks repeat).")

    slen = secret_length(oracle, block_size)
    print(f"[*] Secret length: {slen} bytes")

    secret_bytes = recover_secret(oracle, block_size, slen)
    secret = secret_bytes.decode("utf-8", errors="replace")
    print(f"[*] Recovered SECRET: {secret!r}")

    code = extract_konami(secret)
    print(f"[*] Konami code: {code}")

    ok, token = oracle.unlock(code)
    if not ok or not token:
        print("[!] Unlock failed -- recovered code was rejected.")
        sys.exit(1)
    print(f"[*] Unlock OK, got token ({len(token)} chars).")

    ok, flag = oracle.complete(token)
    if not ok or not flag:
        print("[!] Complete failed -- token rejected.")
        sys.exit(1)

    print(f"[+] FLAG: {flag}")


if __name__ == "__main__":
    main()
