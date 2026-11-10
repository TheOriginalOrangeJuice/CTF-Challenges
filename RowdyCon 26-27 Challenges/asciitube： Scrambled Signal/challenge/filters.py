"""HARD tier: YouTube-content downloads only, with layered filtering.

The player is only meant to download YouTube videos, so a URL has to clear
three checks at once:

  1. a loopback substring blocklist on the raw URL (same list as MEDIUM),
  2. a YouTube host allowlist,
  3. DNS resolution of the host with a private/reserved-IP denylist.

Every naive or MEDIUM-level attempt dies on one of these:

    http://127.1:9000/flag               -> host '127.1' is not YouTube
    http://127.0.0.1.nip.io/flag         -> not YouTube; also resolves to loopback
    http://youtube.com@127.0.0.1:9000/…  -> blocked substring '127.0.0.1'

The flaw is a parser differential: the host is pulled out with a hand-rolled
regex that stops at '@', so it validates the *userinfo* ("youtube.com") while
the HTTP client (urllib3/requests) connects to the real host that comes *after*
the '@'. To win you must chain the '@' trick with a non-literal loopback
encoding so the substring blocklist doesn't catch it either:

    http://youtube.com@127.0.0.2:9000/flag
    http://youtube.com@127.1:9000/flag
    http://youtube.com@2130706433:9000/flag

The resolve/deny-private check is bypassed because it resolves the wrong host
(the userinfo 'youtube.com', which is public), never the loopback address the
request actually goes to.
"""
import re
import socket
import ipaddress

DIFFICULTY = "hard"

ALLOWED_SCHEMES = {"http", "https"}
YOUTUBE_SUFFIXES = ("youtube.com", "youtu.be")
# Carried over from MEDIUM so literal loopback strings are rejected outright.
BLOCK_SUBSTRINGS = ("localhost", "127.0.0.1", "0.0.0.0", "::1", "internal")

# Flawed host extraction: grabs the first host-looking run after the scheme,
# which stops at '@' and therefore reads the userinfo, not the connect host.
_HOST_RE = re.compile(r"^\s*https?://([A-Za-z0-9.\-]+)", re.IGNORECASE)


def _is_blocked_ip(ip):
    addr = ipaddress.ip_address(ip)
    return (addr.is_private or addr.is_loopback or addr.is_link_local
            or addr.is_reserved or addr.is_multicast or addr.is_unspecified)


def check(url):
    low = url.lower()

    scheme = low.split("://", 1)[0] if "://" in low else ""
    if scheme not in ALLOWED_SCHEMES:
        return False, f"scheme '{scheme}' not allowed"

    # 1) loopback substring blocklist (MEDIUM's check)
    for bad in BLOCK_SUBSTRINGS:
        if bad in low:
            return False, f"URL contains blocked term '{bad}'"

    # 2) extract host (flawed: stops at '@' -> reads userinfo)
    m = _HOST_RE.match(url)
    if not m:
        return False, "could not parse a host"
    host = m.group(1).lower()

    # 3) YouTube allowlist
    if not any(host == s or host.endswith("." + s) for s in YOUTUBE_SUFFIXES):
        return False, f"host '{host}' is not a YouTube URL — downloads only"

    # 4) resolve + deny private/reserved addresses
    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        return False, f"DNS resolution failed: {e}"
    for info in infos:
        ip = info[4][0]
        if _is_blocked_ip(ip):
            return False, f"host resolves to blocked address {ip}"

    return True, "accepted YouTube download"
