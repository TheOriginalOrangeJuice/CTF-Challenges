import pathlib,json,hashlib
root=pathlib.Path(__file__).resolve().parents[1]
path=root/'organizer/asset-manifest.json'
data=json.loads(path.read_text())
files=list((root/'challenge/public/assets').rglob('*'))+[root/'challenge/client/src/art.tsx',root/'challenge/client/src/style.css']
data['hashes']={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files) if p.is_file()}
path.write_text(json.dumps(data,indent=2)+'\n')
print(json.dumps({'runtime_assets_hashed':len(data['hashes'])}))
