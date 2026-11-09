# Blue Screen of Death -- Solve Guide

**Category:** Web / Crypto / Forensics / Reversing
**Difficulty:** Insane
**Flag:** `flag{w1nd0ws_98_s3c0nd_3d1t10n_m4st3r_h4ck3r_2024}`

---

## How the Challenge Works

This is a 6-layer chain. No layer explicitly tells you what the next one is -- you have to follow the breadcrumbs embedded in the environment. Each layer's output contains clues that point toward the next.

Connect at `http://CHALLENGE_HOST:9898` and you'll see a fully interactive Windows 98 desktop.

---

## Layer 1: Registry Exploration

### Breadcrumbs that lead here

There are three separate breadcrumbs pointing toward the registry:

1. **Recycle Bin email** -- Double-click the Recycle Bin on the desktop. Inside is a deleted email from "Mike" to `jsmith@microsoft.com` that says:

   > *"Ran the certificate update last night -- had to re-encode the AuthRoot entries again."*

   This nudges you toward the AuthRoot area of the registry.

2. **BOOTLOG.TXT** -- In the DOS prompt, `TYPE C:\WINDOWS\SYSTEM32\BOOTLOG.TXT` shows boot log entries including:

   ```
   [04/06/1999 08:14:28]   Updating AuthRoot certificates
   [04/06/1999 08:14:28]   Registry: HKLM\SOFTWARE\Microsoft\SystemCertificates\AuthRoot
   [04/06/1999 08:14:28]   Encoding: CERTUTIL.CFG (4-stage)
   [04/06/1999 08:14:29]   AutoUpdate: EncodedCRL written
   ```

   This confirms the registry path AND tells you the encoding is "4-stage" and documented in `CERTUTIL.CFG`.

3. **View Page Source** -- Right-click the desktop, choose "Properties...", then "View Page Source". The source contains:

   ```xml
   <certificate-manager autoupdate="true" store="AuthRoot"/>
   ```

   Another pointer to the AuthRoot certificate store in the registry.

### Steps

1. Open **Registry Editor** from the desktop.
2. Navigate: `HKEY_LOCAL_MACHINE` > `SOFTWARE` > `Microsoft` > `SystemCertificates` > `AuthRoot` > `AutoUpdate`
3. Find the `EncodedCRL` value:
   ```
   nfETnZNRJftLNRGsYRtTEbtS5kDPoHNRNjkSNbNQ
   ```

### Decoding the value

The breadcrumb `CERTUTIL.CFG` file (`TYPE C:\WINDOWS\SYSTEM32\CERTUTIL.CFG` in DOS) documents the encoding scheme:

```ini
; Encoding stages (applied in order):
;   Stage 1 - XOR with vendor key
;   Stage 2 - Base64
;   Stage 3 - Reverse
;   Stage 4 - ROT13
;
; Decoding: apply stages in reverse order (4,3,2,1)
;
; Vendor key is derived from the software manufacturer
; name (9 characters, uppercase ASCII).
```

To **decode**, reverse the stages:

1. **ROT13** the encoded string
2. **Reverse** the result
3. **Base64 decode**
4. **XOR** with `MICROSOFT` (the 9-character vendor name)

**Result:** `ACCESS_CODE:DEBUG_0xC0DE_ENTRY`

#### Alternate path: hidden API

`robots.txt` (visible in IE: Favorites > View robots.txt) disallows `/api/`. Enumerating under `/api/` can reveal a `/api/decode` endpoint. `POST {"value": "...", "method": "win98"}` will auto-decode -- but you must discover it AND guess the method name.

---

## Layer 2: DOS Debug Memory Dump

### Breadcrumb from Layer 1

The decoded string `ACCESS_CODE:DEBUG_0xC0DE_ENTRY` directly tells you:
- Use the **DEBUG** tool
- Look at address **0xC0DE**

A secondary breadcrumb exists in the DOS `U` (unassemble) command, which shows fake assembly containing `CALL C0D0` -- pointing to the same memory region.

### Steps

1. Open **MS-DOS Prompt** from the desktop.
2. Type `D C0DE` to dump memory at address 0xC0DE.
3. Read the ASCII column of the hex dump:

   ```
   MODEM_INIT:ATZ\r\nAT+MS=V90,1,28800,56000\r\nATDT*67-1-900-555-0198\r\n
   ```

### Red herrings

| Address | Content |
|---------|---------|
| `D DEAD` | "NICE TRY BUT THIS IS NOT THE FLAG. KEEP LOOKING DEEPER." |
| `D BEEF` | `flag{this_is_a_fake_flag_lol_try_harder}` (fake flag) |

---

## Layer 3: Dial-Up Modem (WebSocket)

### Breadcrumbs from Layer 2

The memory dump starts with `MODEM_INIT:` followed by three AT commands. This tells you:
- You need to use the **modem / Dial-Up Networking** application
- The exact AT command sequence to send

The Recycle Bin email also mentions: *"the modem keeps dropping. I left debug notes on the machine if you need to check the COM port buffers."* -- hinting that modem + debug are connected.

### Steps

1. Open **Dial-Up Networking** (from My Computer or Start Menu).
2. Send the three AT commands **in exact order** (any wrong command resets the sequence to the beginning):

   ```
   ATZ                              → OK
   AT+MS=V90,1,28800,56000          → OK
   ATDT*67-1-900-555-0198           → CONNECT 56000/V90/LAPM
   ```

3. After connection, type anything to receive the transmission:

   ```
   INTRANET LOGIN REQUIRED
   Protocol: NTLM
   Server: WIN98-DC.internal
   ```

---

## Layer 4: NTLM Challenge-Response Authentication

### Breadcrumbs from Layer 3

The modem transmission says `Protocol: NTLM` -- you need to authenticate via NTLM. But you still need to find:

1. **The NTLM endpoint** -- Via API enumeration (robots.txt disallows `/api/`), discover `/api/ntlm/challenge`.

2. **The SAM database with password hashes** -- In DOS, run `DIR C:\WINDOWS\SYSTEM32\CONFIG` to see the SAM file, then `TYPE C:\WINDOWS\SYSTEM32\CONFIG\SAM` to read it:

   ```
   === NTLM HASHES ===
   setup_user:e19ccf75ee54e06b06a5907af13cef42

   === PASSWORD POLICY ===
   Domain: WIN98-DC
   Policy: Passwords derived from hardware identifiers
   Format: [component][model][clock] lowercase, no spaces
   ```

3. **The password** -- The policy says passwords come from hardware identifiers in `[component][model][clock]` format. In the registry at `HKLM\HARDWARE\DESCRIPTION\System\CentralProcessor\0`, the CPU is:

   ```
   ProcessorNameString: Intel Pentium II 450MHz
   ```

   Applying the format (lowercase, no spaces, drop "Intel"): **`pentiumii450mhz`**

   The BOOTLOG.TXT breadcrumb also says `NTLM security provider loaded` and `SAM database: C:\WINDOWS\SYSTEM32\CONFIG\SAM`, confirming you're on the right track.

### Steps

```python
import hashlib, hmac, base64, requests

s = requests.Session()
s.get('http://HOST:9898/')  # init session

# 1. Get challenge + proof-of-work
resp = s.get('http://HOST:9898/api/ntlm/challenge')
data = resp.json()
challenge_b64 = data['challenge']
challenge = base64.b64decode(challenge_b64)
pow_prefix = data['proof_of_work']['prefix']

# 2. Solve proof-of-work: SHA256(prefix + nonce) must start with '00000'
nonce = 0
while True:
    h = hashlib.sha256(f"{pow_prefix}{nonce}".encode()).hexdigest()
    if h.startswith('00000'):
        break
    nonce += 1

# 3. Compute NT hash: MD4(UTF-16-LE("pentiumii450mhz"))
password = "pentiumii450mhz"
nt_hash = hashlib.new('md4', password.encode('utf-16-le')).digest()

# 4. Compute NTLM response: HMAC-MD5(nt_hash, challenge)
response = hmac.new(nt_hash, challenge, hashlib.md5).digest()
response_b64 = base64.b64encode(response).decode()

# 5. Authenticate
resp = s.post('http://HOST:9898/api/ntlm/authenticate', json={
    'username': 'setup_user',
    'challenge': challenge_b64,
    'response': response_b64,
    'pow_nonce': str(nonce)
})
print(resp.json())
```

The successful response contains the **product key validation rules** and the `/api/activate` endpoint. This is the only place these rules are documented.

---

## Layer 5: Product Key Reverse Engineering

### Breadcrumbs from Layer 4 (and earlier)

- The **NTLM auth response** gives you the exact validation algorithm for product keys.
- The **View Page Source** breadcrumb from Layer 1 contains:
  ```html
  <!-- setup.exe /unattend /key:XXXXX-OEM98-XXXXX-XXXXX-XXXXX -->
  ```
  This reveals the OEM98 key format early, so you know it's coming.
- The **Recycle Bin email** says: *"Tried to activate the test image but forgot the product key. Left the validation tool on the internal server."*

### Key format: `XXXXX-OEM98-XXXXX-XXXXX-XXXXX`

**Validation rules** (from NTLM auth response):

| Group | Rule |
|-------|------|
| G1 | Sum of digits must be divisible by 7 |
| G2 | Must be `OEM98` |
| G3 | Each char XOR'd with 0x37, then reversed, must equal `SETUP` |
| G4 | CRC8 of `G1-G2-G3`, zero-padded to 5 hex chars |
| G5 | First 5 chars of HMAC-MD5(key=`MICROSOFT_WINDOWS_98_SE`, msg=`G1-G2-G3-G4`) |

### Generating a valid key

```python
import hashlib, hmac

def crc8(data):
    crc = 0
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 0x80:
                crc = ((crc << 1) ^ 0x07) & 0xFF
            else:
                crc = (crc << 1) & 0xFF
    return crc

g1 = "16000"    # 1+6+0+0+0 = 7, divisible by 7
g2 = "OEM98"
# G3: reversed "SETUP" XOR'd with 0x37 → GBCRD
g3 = "GBCRD"

combined = f"{g1}-{g2}-{g3}"
crc = crc8(combined.encode())
g4 = format(crc, '02X').zfill(5)[:5]   # "0002B"

hmac_input = f"{g1}-{g2}-{g3}-{g4}"
g5 = hmac.new(b"MICROSOFT_WINDOWS_98_SE",
              hmac_input.encode(), hashlib.md5).hexdigest()[:5].upper()

key = f"{g1}-{g2}-{g3}-{g4}-{g5}"
print(key)  # 16000-OEM98-GBCRD-0002B-7D68F
```

### Submitting the key (requires visual CAPTCHA)

```python
# 1. Get the SVG CAPTCHA
resp = s.get('http://HOST:9898/api/activate/captcha')
with open('captcha.svg', 'wb') as f:
    f.write(resp.content)

# 2. Open captcha.svg in a browser and read the 6-character code
verification_code = input("Enter the 6-char code from captcha.svg: ")

# 3. Submit
resp = s.post('http://HOST:9898/api/activate', json={
    'product_key': '16000-OEM98-GBCRD-0002B-7D68F',
    'verification_code': verification_code
})
print(resp.json())
```

---

## Layer 6: BSOD Memory Dump Extraction

### Breadcrumb from Layer 5

Successful activation returns a JSON response with a `bsod` object. There is **no instruction** telling you the flag is in the dump -- you must examine the hex data yourself.

### Response

```json
{
  "activated": true,
  "message": "Windows 98 Product Activation Successful!",
  "bsod": {
    "error_code": "STOP: 0x0000004E ...",
    "module": "PFN_LIST_CORRUPT",
    "description": "A fatal exception 0E has occurred...",
    "memory_dump": "80000000  66 6c 61 67 7b 77 31 6e  64 30 77 73 5f 39 38 5f  |flag{w1nd0ws_98_|..."
  }
}
```

### Extract the flag

```python
dump = resp.json()['bsod']['memory_dump']
flag = ''
for line in dump.split('\n'):
    if '|' in line:
        flag += line.split('|')[1]

import re
print(re.search(r'flag\{[^}]+\}', flag).group(0))
```

**Flag:** `flag{w1nd0ws_98_s3c0nd_3d1t10n_m4st3r_h4ck3r_2024}`

---

## Breadcrumb Map

This diagram shows how clues in each layer point the player to the next:

```
 DESKTOP EXPLORATION
 │
 ├── Recycle Bin email ─────────────┐
 │   "re-encode the AuthRoot        │
 │    entries"                       │
 │   "modem keeps dropping"          │
 │   "forgot the product key"        │
 │                                   │
 ├── BOOTLOG.TXT ──────────────────┐│
 │   "Registry: HKLM\...\AuthRoot" ││
 │   "Encoding: CERTUTIL.CFG"      ││
 │   "NTLM security provider"      ││
 │   "SAM database: ...\SAM"       ││
 │                                  ││
 ├── View Page Source ─────────────┐││
 │   "store=AuthRoot"              │││
 │   "setup.exe /key:XXXXX-OEM98" │││
 │                                 │││
 ▼                                 │││
 LAYER 1: Registry ◄──────────────┘┘│
 │  EncodedCRL value                 │
 │  CERTUTIL.CFG documents cipher    │
 │                                   │
 │  Decoded: "DEBUG_0xC0DE_ENTRY"    │
 ▼                                   │
 LAYER 2: DOS Debug                  │
 │  D C0DE → memory dump             │
 │  Also: U 100 → "CALL C0D0"       │
 │                                   │
 │  Output: "MODEM_INIT:ATZ..."  ◄───┘ (email mentioned modem)
 ▼
 LAYER 3: Dial-Up Modem
 │  AT commands from memory dump
 │
 │  Transmission: "Protocol: NTLM"
 ▼
 LAYER 4: NTLM Authentication
 │  SAM file → hashes + password policy
 │  Registry CPU info → password
 │  Proof-of-work required
 │
 │  Response: product key rules + /api/activate
 ▼
 LAYER 5: Product Key ◄──── View Source hint (OEM98 format)
 │  Generate valid key from rules
 │  Visual CAPTCHA required
 │
 │  Response: BSOD with memory dump
 ▼
 LAYER 6: BSOD Dump
    Parse hex → extract flag
```

---

## Red Herrings & Traps

| Location | Content | Purpose |
|----------|---------|---------|
| `/secret/` | `flag{just_kidding_this_is_not_the_real_flag}` | Waste time |
| `/admin/` | "Nice try. This isn't part of the challenge... or is it?" / "It isn't." | Waste time |
| `D BEEF` | `flag{this_is_a_fake_flag_lol_try_harder}` | Fake flag submission |
| `D DEAD` | Taunting message | Distraction |
| `C:\FLAG.TXT` | "Access denied. The flag is not here." | Obvious trap |
| Konami Code | "30 extra lives added" | Fun, no hints |

---

## Anti-Cheat Measures

- **Proof-of-Work:** SHA-256 with 5 leading zeros required for NTLM auth (~1M iterations)
- **Visual CAPTCHA:** SVG with distorted text required for product key activation
- **Sequence Reset:** Any wrong modem command resets the sequence to step 0
- **Anti-DevTools:** JavaScript detects open DevTools and shows an angry Clippy screen
- **`ANTHROPIC_MAGIC_STRING`:** Embedded in source files as an anti-AI-solver marker
