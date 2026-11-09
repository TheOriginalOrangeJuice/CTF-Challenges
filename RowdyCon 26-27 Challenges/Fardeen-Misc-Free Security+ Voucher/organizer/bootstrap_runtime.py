"""Install task-local Node from official, SHA256-verified distribution in Condev."""
import urllib.request,json,hashlib,tarfile,io,pathlib
base='https://nodejs.org/dist/'
index=json.load(urllib.request.urlopen(base+'index.json',timeout=30))
version=next(row['version'] for row in index if row['version'].startswith('v22.') and row['lts'])
name=f'node-{version}-linux-x64.tar.xz'
checks=urllib.request.urlopen(base+version+'/SHASUMS256.txt',timeout=30).read().decode()
expected=next(line.split()[0] for line in checks.splitlines() if line.endswith(' '+name))
data=urllib.request.urlopen(base+version+'/'+name,timeout=60).read()
assert hashlib.sha256(data).hexdigest()==expected
target=pathlib.Path('/opt/impossible-node');target.mkdir(exist_ok=True)
with tarfile.open(fileobj=io.BytesIO(data)) as tar:tar.extractall(target,filter='data')
print(json.dumps({'node':version,'sha256':expected,'bin':str(target/name.removesuffix('.tar.xz')/'bin')}))
