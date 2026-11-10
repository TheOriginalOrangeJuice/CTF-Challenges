"""Deterministic artifact and public-boundary checks; run after generate.py."""
import hashlib,json,re,subprocess,array
from pathlib import Path
from generate import TARGET,KEY,FLAG,az,encrypt,PUBLIC
data=json.loads((PUBLIC/'evidence.json').read_text(encoding='utf-8'))
assert data['target']['cipher']==encrypt(TARGET,KEY)
assert len(az(TARGET))==256
assert az(TARGET).index('RCC')==128
assert set(range(128,128+len(az(FLAG)))) and {i%16 for i in range(128,128+len(az(FLAG)))}==set(range(16))
for path in PUBLIC.rglob('*'):
    if path.is_file() and path.suffix in {'.js','.json','.html','.txt','.css'}:
        text=path.read_text(encoding='utf-8')
        assert KEY not in text and FLAG not in text and TARGET not in text, f'private answer leaked: {path}'
audio=[]
for path in sorted((PUBLIC/'audio').glob('*.mp3')):
    decoded=subprocess.run(['ffmpeg','-v','error','-i',str(path),'-f','f32le','-ac','1','-ar','22050','pipe:1'],capture_output=True,check=True)
    samples=array.array('f',decoded.stdout);peak=max(abs(n) for n in samples)
    assert len(samples)>100 and peak>.01
    audio.append({'file':path.name,'seconds':len(samples)/22050,'peak':peak,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
assert len(audio)==4
digest=(PUBLIC.parent/'completion.sha256').read_text().strip()
assert digest==hashlib.sha256(FLAG.encode()).hexdigest()
assert all(digest not in p.read_text(encoding='utf-8') for p in PUBLIC.rglob('*') if p.is_file() and p.suffix in {'.js','.json','.html','.txt','.css'})
print(json.dumps({'pass':True,'target_letters':256,'public_answer_scan':'passed','audio':audio}))
