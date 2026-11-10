"""Challenge-owned Condev build/preview orchestration. Run inside Condev only."""
import os,sys,pathlib,subprocess,json,socket,time,signal,sqlite3
root=pathlib.Path(__file__).resolve().parents[1]
node=next(pathlib.Path('/opt/impossible-node').glob('node-*/bin'))
env=os.environ.copy();env['PATH']=str(node)+':'+env.get('PATH','')
mode=sys.argv[1]
if mode=='build':
 if not (root/'challenge/node_modules').exists():subprocess.run(['npm','ci','--prefer-offline','--no-audit','--no-fund'],cwd=root/'challenge',env=env,check=True)
 for cmd,name in [(['npm','run','build'],'v5-build.txt'),(['npm','test'],'v5-tests.txt')]:
  run=subprocess.run(cmd,cwd=root/'challenge',env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
  (root/'organizer'/name).write_text(run.stdout);print(run.stdout);run.check_returncode()
elif mode=='start':
 prior=pathlib.Path(sys.argv[2]) if len(sys.argv)>2 else None
 dbpath=str(root.parent/'preview.sqlite')
 if prior and prior.exists():
  pid=int(prior.read_text());proc=pathlib.Path('/proc')/str(pid)
  if proc.exists():
   cmd=(proc/'cmdline').read_bytes().replace(b'\0',b' ').decode();cwd=os.readlink(proc/'cwd')
   if 'dist/server/index.js' not in cmd or 'The Impossible Security+ Quiz/challenge' not in cwd:raise RuntimeError('Refusing to stop a process outside this challenge')
   oldenv=dict(s.decode().split('=',1) for s in (proc/'environ').read_bytes().split(b'\0') if b'=' in s)
   olddb=oldenv.get('DB_PATH')
   if olddb and pathlib.Path(olddb).exists():
    with sqlite3.connect(olddb) as src,sqlite3.connect(root.parent/'preview-before-v5.sqlite') as dest:src.backup(dest)
    dbpath=olddb
   os.kill(pid,signal.SIGTERM)
   for _ in range(30):
    if not proc.exists():break
    time.sleep(.1)
 with socket.socket() as sock:
  sock.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);sock.bind(('0.0.0.0',18115))
 for line in (root/'organizer/event.env').read_text().splitlines():
  if line and not line.startswith('#') and '=' in line:
   key,val=line.split('=',1);env[key]=val.strip('"\'')
 env.update(PORT='18115',PUBLIC_ORIGIN='http://localhost:18115',DB_PATH=dbpath)
 log=open(root.parent/'server.log','a');p=subprocess.Popen(['node','dist/server/index.js'],cwd=root/'challenge',env=env,stdout=log,stderr=log,start_new_session=True)
 (root.parent/'server.pid').write_text(str(p.pid));print(json.dumps({'pid':p.pid,'db':dbpath,'tree':str(root),'port':18115}))
else:raise SystemExit('Unknown runtime action')

