"""Compare a complete staged first-party tree with its host SHA-256 manifest."""
import pathlib,json,hashlib,sys
root=pathlib.Path(sys.argv[1]);manifest=json.loads(pathlib.Path(sys.argv[2]).read_text(encoding='utf-8-sig'));bad=[]
for rel,expected in manifest.items():
 p=root/rel
 if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest().lower()!=expected.lower():bad.append(rel)
if bad:raise SystemExit('Parity failed: '+repr(bad))
print(json.dumps({'verifiedFiles':len(manifest),'hashDifferences':0}))
