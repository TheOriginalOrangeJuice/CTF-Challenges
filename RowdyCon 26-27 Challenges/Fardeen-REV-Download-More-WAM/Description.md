# Download More WAM

**Rev | Hard**

## Description

I'm trying to run the latest AI model released by Mortarolla but I don't have enough RAM to run it. My friend sent me this website where you can apparently download more RAM, but it's only 16GB.... However, if I get a license key, I can get UNLIMITED RAM??? I need to get that key. There's probably something wrong with this RAM they're promising that I can exploit. 


## Files

Single Docker container; run these commands from this challenge folder:

```bash
docker build -t rowdy-wam:2026 challenge
docker run -d --name rowdy-wam -p 18102:18102 \
  --restart unless-stopped rowdy-wam:2026
```

Open `http://localhost:18102`. Reset: `docker restart rowdy-wam`. Remove: `docker rm -f rowdy-wam`.

Players receive the URL and optionally [ramcloud-player.zip](challenge/public/downloads/ramcloud-player.zip), also in **Downloads**. Keep this document and the remaining source organizer-only. [Maintenance commands](organizer/OPERATIONS.md).

## Hint(s)

1. Downloaded bytes and addressable bytes are not the same quantity.
2. Follow one address from the benchmark through the page-lookup routine into a package.
3. Rebuild virtual memory first. The interpreter dispatch loop then explains how to read the checker stored inside it.

## Walkthrough

1. Open RAMCloud, select **Download 16 GB of WAM**, then **Diagnostics**. Inspect `02F3`: it maps to `bank-0.dimm`, file offset `0x01DA`, backing byte `0x2B`. Save the complete diagnostic kit from **Downloads**, or use the commands below in a Linux terminal with Python 3 and Node/npm.

![The live inspector maps virtual address 02F3 to a backing byte.](screenshots/02-diagnostics.png)

```bash
mkdir -p /tmp/wam-player
cd /tmp/wam-player
curl -fsS http://localhost:18102/downloads/ramcloud-player.zip \
  -o ramcloud-player.zip
python3 -m zipfile -e ramcloud-player.zip evidence
cd evidence
cat diagnostic-trace.txt
```

2. Decompile the downloaded WebAssembly host, the portable executable that runs the license checker. WABT supplies a C-like view of its instructions:

```bash
npm install --prefix /tmp/wam-wabt wabt@1.0.37
/tmp/wam-wabt/node_modules/.bin/wasm-decompile \
  ramcloud-host.wasm -o host.dcmp
```

Read exported `translate` (function 3). `index_buffer()` returns 1024; row comparisons begin at 1040 and advance by eight. Thus `pages.rci` has a 16-byte header and sixteen 8-byte rows. The repeated comparisons are an unrolled row lookup. For address `a`, recover:

```text
page = a >> 8; offset = a & 255
choose row with (row[0] XOR 0xA7) == page
bank = row[1]
slot = row[2] XOR ((page*7 + 0x39) & 255)
lane = ROTL8(offset, row[4]) XOR row[3]
file_offset = 32 + slot*256 + lane
```

`ROTL8` rotates eight bits left, wrapping overflow bits around. `translate` returns the bank in its high byte and the file offset in its low 24 bits. At the start of exported `check` (function 6), each fetched backing byte is XORed with `(page*29 + offset*7 + 0x5D) & 255`. That produces the bus byte: the first trace entry gives `0x2B XOR 0x3C = 0x17`. Check the remaining trace entries the same way. Use decoded bus bytes for every VM instruction fetch and data read.

3. Rebuild virtual memory using those rules. Save this as `/tmp/wam-player/reconstruct.py`, then run `python3 ../reconstruct.py` from `evidence/`. Concatenating the four banks would preserve neither page order nor decoded bytes.

```python
from pathlib import Path
import struct

index = Path('pages.rci').read_bytes()
entry, pages = struct.unpack_from('<HH', index, 4)
memory = bytearray(pages * 256)
for start in range(16, len(index), 8):
    d = index[start:start + 8]
    page = d[0] ^ 0xA7
    slot = d[2] ^ ((page * 7 + 0x39) & 255)
    bank = Path(f'bank-{d[1]}.dimm').read_bytes()
    for off in range(256):
        rot = ((off << d[4]) | (off >> (8-d[4]))) & 255
        raw = bank[32 + slot*256 + (rot ^ d[3])]
        memory[page*256 + off] = raw ^ ((page*29 + off*7 + 0x5D) & 255)
Path('../memory.bin').write_bytes(memory)
print(f'entry=0x{entry:04X}, bytes={len(memory)}')
```

The result is `entry=0x02F3, bytes=4096`.

4. Follow `check`'s dispatch branches to recover the virtual machine. Its program counter comes from index offset 4; its stack contains sixteen 16-bit registers. For example, opcode decimal 23 (`17` hex) reads a register and license-word index, then copies that input word into the register. All arithmetic wraps at 65536. Multi-byte words are little-endian: low byte first.

| Hex instruction | Meaning |
| --- | --- |
| `17 r i` | Load license word i into register r |
| `2D r lo hi` | Set r to an immediate word |
| `53 a b` | Copy register b into a |
| `84 a b` / `A6 a b` | Add / XOR b into a |
| `39 r n` | Rotate r left by n bits |
| `62 a b` | Load word at virtual address r[b] into a |
| `71 r lo hi` | Add an immediate word to r |
| `46 a b` / `99 r` | Swap registers / decrement r |
| `C3 r lo hi` | Branch if r is nonzero |
| `BD lo hi` | Unconditional branch |
| `E1 a b` / `F0` | Accumulate equality / return result |

Each displayed token is one byte. Branch offsets are signed 16-bit displacements from the next instruction. Follow jumps from `0x02F3`; do not decode unused memory as instructions. The opening loads inputs into `r0..r7`, sets `r12=0x0CFA` and `r13=10`, then jumps from `0x0313` to `0x06E7`.

5. Trace the loop at `0x06E7`. It loads constants through `r12`, computes four temporary words, XORs them into `r0..r3`, swaps those registers with `r4..r7`, and repeats ten times. Let `L=r0..r3` and `R=r4..r7`; the recovered round is:

```text
F[i] = ROTL16((R[i] + K[4*t+i]) mod 65536,
              [5,8,11,14][i]) XOR R[(i+1) mod 4]
new_L = R
new_R = L XOR F
```

The constants are forty words starting at `0x0CFA`. The comparison code at `0x0AEE` reads eight target words from `0x0EF7`: `CFD8 C02B 4562 62E1 CFE3 D293 08E1 C1B6`. These addresses come from the bytecode's immediate loads; read across page boundaries in reconstructed memory.

6. Reverse the rounds. This is a Feistel construction: `old_R = new_L`, then `old_L = new_R XOR F(old_R)`. Save this as `/tmp/wam-player/invert.py` and run `python3 invert.py` from `/tmp/wam-player`, beside `memory.bin`:

```python
from pathlib import Path
import struct

memory = Path('memory.bin').read_bytes()
keys = struct.unpack_from('<40H', memory, 0x0CFA)
state = list(struct.unpack_from('<8H', memory, 0x0EF7))
rotations = [5, 8, 11, 14]
def rol16(x, n):
    return ((x << n) | (x >> (16-n))) & 65535
for t in reversed(range(10)):
    right, output = state[:4], state[4:]
    f = [rol16((right[i] + keys[4*t+i]) & 65535,
               rotations[i]) ^ right[(i+1) % 4] for i in range(4)]
    state = [output[i] ^ f[i] for i in range(4)] + right
print('-'.join(f'{word:04X}' for word in state))
```

The recovered activation code is `6662-49A2-5584-455E-732C-DF46-6606-121A`. The complete [reference solver](organizer/solve.py) also implements the recovered instruction set and writes its reachable disassembly; its constants come from the downloaded memory.

7. Return to **Overview**, paste the code, and select **Activate Unlimited WAM**. The original service runs its checker and returns the receipt shown below. A direct submission is equivalent:

```bash
curl -fsS http://localhost:18102/api/activate \
  -H 'Content-Type: application/json' \
  --data '{"license":"6662-49A2-5584-455E-732C-DF46-6606-121A"}'
```

![The original service accepts the recovered code and returns the RCC receipt.](screenshots/04-activation.png)

## Flag

`RCC{d3d0t4t3d_w4m_h4s_p4g3_t4bl3s}`
