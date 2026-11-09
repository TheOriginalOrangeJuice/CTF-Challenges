"""Repeat artifact generation from frozen derivatives and compare all bytes."""
from pathlib import Path
import hashlib,json
from generate import generate
root=Path(__file__).resolve().parents[1]
def hashes():
    return {p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for folder in [root/'challenge'/'public'/'media',root/'challenge'/'public'/'assets'] for p in sorted(folder.rglob('*')) if p.is_file()}
before=hashes();generate();after=hashes()
changes=[p for p in set(before)|set(after) if before.get(p)!=after.get(p)]
record={'result':'passed' if not changes else 'failed','files':len(after),'changed':changes,'scope':'All public media, archive, thumbnails and app icon, using frozen rasterized logo and encoded gameplay derivative.'}
(root/'organizer'/'repeatability.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record,indent=2))
if changes:raise SystemExit(1)
