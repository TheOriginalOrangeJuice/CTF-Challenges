# Solution — asciitube: Scrambled Signal (Hard)

**Flag:** `RCC{userinfo_at_trick_beats_the_allowlist}`

## Run this challenge on its own
```bash
cd hard
docker compose up --build        # -> http://localhost:5003
```

## The filters (stacked)
1. **Global gate:** the URL must contain `youtube`.
2. **Substring blocklist** (from Medium): `localhost`, `127.0.0.1`, `0.0.0.0`, `::1`, `internal`.
3. **YouTube host allowlist:** the host is extracted and must be a youtube domain.
4. **DNS resolve + deny-private:** the extracted host is resolved and rejected if
   it maps to a loopback/private/link-local/reserved address.

Every earlier trick dies:
- `http://127.0.0.2:9000/flag` → the host isn't YouTube (allowlist).
- `http://youtube.com.evil.example/…` → not a youtube domain.
- any real loopback host → resolves to a private address → denied.

## The flaw: a parser differential (validator vs. HTTP client)
The host is pulled out of the URL with a hand-rolled regex that grabs the first
run of host-ish characters after the scheme — and **stops at `@`**:

```
^\s*https?://([A-Za-z0-9.\-]+)
```

So for `http://youtube.com@127.0.0.2:9000/flag` the validator reads the host as
`youtube.com` (which is actually the *userinfo*), passes the allowlist, resolves
*youtube.com* (public), and passes the deny-private check.

But `requests`/urllib3 parse the URL per RFC 3986: everything before `@` in the
authority is userinfo, and the real host is `127.0.0.2`. So the request is sent
to the internal service. The validator and the client disagree about where the
URL points.

## Exploit
Put a youtube domain in the userinfo, the real target after `@`, and use a
non-literal loopback encoding so the substring blocklist doesn't fire:

```
http://youtube.com@127.0.0.2:9000/flag
```

- contains `youtube` → global gate ✓
- no blocked literal (`127.0.0.2` ≠ `127.0.0.1`) → blocklist ✓
- validator's host = `youtube.com` → allowlist ✓ and resolves public → deny-private ✓
- `requests` connects to `127.0.0.2:9000` → internal `/flag` → body reflected

Other encodings after the `@` work too (`@127.1`, `@2130706433`).

**Solver:** `python solve_hard.py http://localhost:5003`

## Why deny-private doesn't save it
The deny-private check resolves the *validator's* idea of the host
(`youtube.com`) — never the address the request actually reaches. Validation and
connection must operate on the **same** parsed host, or an attacker splits them.