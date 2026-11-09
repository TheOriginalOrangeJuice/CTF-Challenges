# Crowns Pending — Verification Required

**Category:** Crypto · **Difficulty:** Medium

## Description


I begged my parents for MONTHS to get me the $5.99 Wizard101 membership but they HATE me and won't buy it for me. Then I got this video on my YouTube page on "How to get Free Wizard101 Crowns". I'm not tech literate so can you help me get my crowns?? My username is xx_BeastModeOnl1ne_xx. 

## Files

Single Docker container built from [challenge/](challenge/Dockerfile). Run these commands from this numbered folder, then open `http://localhost:18104`:

```bash
docker build -t rowdy-crowns04:review challenge
docker run -d --name rowdy-crowns04-review \
  -p 18104:8080 --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true \
  rowdy-crowns04:review
```

Players receive the website and its `generation-log.txt` and `claim.json` downloads. This document, screenshots, organizer files, source tree, and Docker image contain spoilers or private data; keep them organizer-only. Stop with `docker stop rowdy-crowns04-review`; reset with `docker restart rowdy-crowns04-review`. Regeneration and check commands are in [organizer/OPERATIONS.md](organizer/OPERATIONS.md).

## Hint(s)

1. The generator negotiated two delivery keys. Keep both.
2. Different RSA moduli should not normally share a prime factor.
3. Compute their greatest common divisor, reconstruct Mirror A's private exponent, and decrypt its receipt.

## Walkthrough

1. **Reach verification.** Open the site, enter an optional fictional nickname, choose a Crown amount, and select **Generate Crowns**. Wait twelve seconds for the verification dialog and encrypted claim receipt. The realm choice is cosmetic; **Sound On** toggles the sound effects.

2. **Save the evidence.** Select **Back to the delivery log**, then expand both mirror entries under **Delivery server log**. Mirror A and Mirror B each supply a modulus, the large integer called `n`, and exponent 65537. Download the log and receipt. These Bash commands do the same; use Python 3.8 or newer. Inside Condev, first set `export BASE=http://host.docker.internal:18104`.

```bash
BASE="${BASE:-http://localhost:18104}"
mkdir crowns-solve
cd crowns-solve
curl -fsS "$BASE/generation-log.txt" -o generation-log.txt
curl -fsS "$BASE/claim.json" -o claim.json
```

![Both complete mirror keys in the expanded delivery log](screenshots/02-generation-log.png)

3. **Identify the shared prime.** RSA multiplies two secret primes to form each modulus. The mirrors reused one: `nA = p × qA` and `nB = p × qB`. Their greatest common divisor gives `p`, and division gives `qA`. The receipt identifies Mirror A and specifies raw RSA with no padding.

4. **Decrypt the receipt.** Compute `phi = (p - 1) × (qA - 1)`. The modular inverse of `e` modulo `phi` gives the private exponent `d`; Python's `pow(c, d, nA)` then recovers the message integer. Convert it to big-endian bytes and decode ASCII, as the receipt specifies. Run this in the same shell:

```bash
cat > decrypt.py <<'PY'
import json, math, re
from pathlib import Path
log = Path("generation-log.txt").read_text()
receipt = json.loads(Path("claim.json").read_text())
def number(name):
    return int(re.search(rf"^{name} = (\d+)$", log, re.M)[1])
nA, nB, e = number("nA"), number("nB"), number("eA")
assert receipt["key_id"] == "mirror_A"
assert e == number("eB") == 65537
c = int(receipt["ciphertext_decimal"])
p = math.gcd(nA, nB)
assert 1 < p < min(nA, nB)
qA = nA // p
d = pow(e, -1, (p - 1) * (qA - 1))
m = pow(c, d, nA)
assert pow(m, e, nA) == c
code = m.to_bytes((m.bit_length() + 7) // 8, "big").decode()
print("Modulus bits:", nA.bit_length(), nB.bit_length())
print("Shared prime bits:", p.bit_length())
print("Claim code:", code)
Path("claim-request.json").write_text(json.dumps({"code": code}))
PY
python3 decrypt.py
```

5. **Check the result.** The reencryption assertion confirms that the recovered message produces the original ciphertext. The output is:

```text
Modulus bits: 2048 2048
Shared prime bits: 1024
Claim code: CROWN-9e7f4937af0b6da6a9b7fa9103597453
```

6. **Redeem the code.** Select **Complete Verification to Claim** to reopen the dialog. Paste the recovered `CROWN-...` value into the claim field and select **Verify & Release Crowns**. Alternatively, submit the JSON file created by the script:

```bash
curl -fsS "$BASE/api/claim" \
  -H 'Content-Type: application/json' \
  --data-binary @claim-request.json -o redemption.json
python3 -m json.tool redemption.json
```

The server returns the flag with **“Crowns delivered: 0. Flag delivered: 1.”** Select **Copy flag** to copy the reward.

![Successful redemption with the actual RCC flag](screenshots/04-successful-reward.png)

## Flag

`RCC{tw0_m1rr0rs_0ne_pr1me_z3r0_cr0wns_9e7a42c1}`
