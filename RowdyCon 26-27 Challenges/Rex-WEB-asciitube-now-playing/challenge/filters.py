"""EASY tier: no SSRF filtering.

The only check is the global "URL must contain youtube" gate in app.py. So point
straight at the internal flag service and tack on a youtube marker:

    http://127.0.0.1:9000/flag#youtube
"""

DIFFICULTY = "easy"


def check(url):
    """Return (allowed, reason). Easy allows everything."""
    return True, "no filtering"
