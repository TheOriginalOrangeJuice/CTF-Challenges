# DefinitelyNotNitro.zip

**Forensics | Medium**

## Description

My friend sent me a torrent link to get Discord Nitro for free??? I've been on Skype for so long that this might finally be my chance to leave it for good! I started the download but I think my VPN failed along the way. Help me recover the download and get me my free Nitro. 


## Files

Single Docker container, built from [challenge/](challenge/Dockerfile). From this directory:

```bash
docker build -t rowdy06-nitro:local challenge
docker run -d --name rowdy06-nitro -p 18106:18106 \
  --read-only --cap-drop=ALL \
  --security-opt=no-new-privileges rowdy06-nitro:local
```

Open `http://localhost:18106`. Players download `DefinitelyNotNitro.torrent` and `transfer-session.pcap` from the toolbar. The other downloads are optional music, wallpapers, sounds, and video. All files are included; play needs no accounts or outside connections. **Reset session** restores the client. Stop the container with `docker stop rowdy06-nitro`.

Keep this document, `organizer/`, and `screenshots/` private. Maintenance commands are in [organizer/OPERATIONS.md](organizer/OPERATIONS.md).

## Hint(s)

1. The peer list is more useful than the order packets arrived.
2. Piece messages describe where their data belongs; the torrent file describes what valid pieces look like.
3. Reassemble TCP, place piece data by index and offset, and use the metadata's hashes to choose valid retransmissions.

## Walkthrough

Use Wireshark (including TShark) and Python 3.

1. **Save the evidence.** Download the capture and torrent into one folder using the toolbar below. The saved log records a completed transfer followed by a disk-write error, so recover the ZIP from the captured traffic.

![AeroTorrent evidence downloads](screenshots/07-evidence-downloads.png)

2. **Reassemble the traffic.** Open `transfer-session.pcap` in Wireshark. Under **Preferences → Protocols**, enable the TCP and BitTorrent options shown below so messages spanning several packets are decoded together.

![TCP reassembly setting](screenshots/11-tcp-reassembly.png)

![BitTorrent reassembly setting](screenshots/12-bittorrent-reassembly.png)

3. **Inspect a piece.** Filter on `bittorrent.msg.type == 7` and expand a Piece message. Its index identifies the piece, its offset locates the block within it, and its data supplies the file bytes.

![Decoded piece index, offset, and data](screenshots/08-wireshark-pieces.png)

4. **Rebuild the ZIP.** Save this as `recover.py` beside the downloads. TShark reassembles the connections; the script places their blocks and uses the torrent's hashes to select intact copies.

```python
from collections import defaultdict
from hashlib import sha1
from pathlib import Path
import bencodepy, shutil, subprocess

info = bencodepy.decode(
    Path("DefinitelyNotNitro.torrent").read_bytes())[b"info"]
size, total = info[b"piece length"], info[b"length"]
hashes = info[b"pieces"]
tshark = shutil.which("tshark") or (
    r"C:\Program Files\Wireshark\tshark.exe")
command = [tshark, "-r", "transfer-session.pcap",
    "-o", "tcp.reassemble_out_of_order:TRUE",
    "-o", "bittorrent.desegment:TRUE",
    "-Y", "bittorrent.msg.type == 7", "-T", "fields"]
for field in ["tcp.stream", "bittorrent.piece.index",
              "bittorrent.piece.begin", "bittorrent.piece.data"]:
    command += ["-e", field]
rows = subprocess.check_output(
    command, text=True, stderr=subprocess.DEVNULL)

# Keep each connection's copies separate.
blocks = defaultdict(dict)
for row in rows.splitlines():
    peer, indices, offsets, data = row.split("\t")
    for i, offset, raw in zip(indices.split(","),
                             offsets.split(","), data.split(",")):
        blocks[peer, int(i, 0)][int(offset, 0)] = bytes.fromhex(raw)

# Place blocks by offset and keep intact pieces.
pieces = {}
for (_, i), parts in blocks.items():
    piece = bytearray(min(size, total - i * size))
    for offset, data in parts.items():
        piece[offset:offset + len(data)] = data
    if sha1(piece).digest() == hashes[i * 20:(i + 1) * 20]:
        pieces[i] = piece
archive = b"".join(pieces[i] for i in range(len(hashes) // 20))
Path("DefinitelyNotNitro.zip").write_bytes(archive)
print("Recovered DefinitelyNotNitro.zip")
```

Run from that folder in PowerShell:

```powershell
py -m pip install bencodepy==0.9.5
py recover.py
```

5. **Read the redemption card.** Extract `DefinitelyNotNitro.zip` and open `OPEN_ME.png`. The Discord Nitrogen redemption code is the flag.

![Recovered redemption card](screenshots/09-recovered-code.png)

## Flag

`RCC{n1tr0g3n_1s_78_p3rc3nt_fr33}`
