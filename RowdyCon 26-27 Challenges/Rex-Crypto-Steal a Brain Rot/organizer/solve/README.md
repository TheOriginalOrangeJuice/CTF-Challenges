# solve/ — author tooling (not for players)

`solve.py` is the **author's reference solver** for the Steal-a-Brain-Rot
challenge. It demonstrates the intended solution — the cryptopals-12
byte-at-a-time AES-ECB decryption attack against the `/arena/oracle` endpoint —
then unlocks and prints the flag.

**Do not ship this to players.** It is used to validate that the challenge is
solvable and that the flag releases correctly.

## Usage

```bash
python3 solve.py [base_url]     # default: http://localhost:8080
```

Standard library only — no `pip install` required. It never performs AES
locally; it recovers the secret purely by querying the remote oracle.
