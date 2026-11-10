"""Cold Compose deployment check, executed inside Docker-enabled Condev."""
import pathlib,subprocess,json
root=pathlib.Path(__file__).resolve().parents[1]
base=['docker','compose','--project-name','rowdy-impossible-v3-validation','--env-file','../organizer/event.env']
def compose(*args):return subprocess.run(base+list(args),cwd=root/'challenge',check=True,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT).stdout
report={'tree':str(root),'port':18115,'project':'rowdy-impossible-v3-validation'}
try:
 print(compose('up','-d','--no-build'))
 raw=(root/'challenge/tests/steps.ts').read_text();steps='{'+raw.split('[]>={',1)[1].split('\n};',1)[0]+'}'
 steps=steps.replace(' as [string,Record<string,unknown>]','')
 js="""
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
const base='http://localhost:8080';let res;
for(let i=0;i<50;i++){try{res=await fetch(base+'/health');if(res.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert(res?.ok);
res=await fetch(base+'/api/session',{method:'POST'});const cookie=res.headers.get('set-cookie').split(';')[0];let s=(await res.json()).state;
const post=async body=>{const r=await fetch(base+'/api/action',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);return await r.json();};
const body=(kind,extra={})=>({requestId:crypto.randomUUID(),attempt:s.attempt,revision:s.revision,q:s.q,kind,...extra});
const wrong=body('play',{op:'answer',args:{index:0}});s=(await post(wrong)).state;assert.equal(s.lives,2);assert.equal((await post(wrong)).state.lives,2);s=(await post(body('restart'))).state;
const steps=STEPS;
for(let q=1;q<=20;q++){assert.equal(s.q,q);for(const [op,args] of steps[q])s=(await post(body('play',{op,args}))).state;assert.equal(s.lives,3);}
assert.equal(s.status,'won');assert.equal(s.skips,0);const reward=await(await fetch(base+'/api/reward',{headers:{cookie}})).json();assert.equal(reward.flag,process.env.FLAG);
writeFileSync('/data/validation-cookie',cookie);console.log(JSON.stringify({health:true,twentyQuestions:true,duplicateSafe:true,threeLives:true,atomicTokens:true,reward:true}));
""".replace('STEPS',steps)
 report['publicSolve']=json.loads(compose('exec','-T','quiz','node','--input-type=module','-e',js).strip())
 print(compose('restart','quiz'))
 verify="""
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const cookie=readFileSync('/data/validation-cookie','utf8');let r;
for(let i=0;i<50;i++){try{r=await fetch('http://localhost:8080/api/state',{headers:{cookie}});if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
const s=(await r.json()).state;assert.equal(s.status,'won');assert.equal(s.skips,0);assert.equal((await(await fetch('http://localhost:8080/api/reward',{headers:{cookie}})).json()).flag,process.env.FLAG);console.log(JSON.stringify({sqliteRestart:true,rewardRecovery:true}));
"""
 report['restart']=json.loads(compose('exec','-T','quiz','node','--input-type=module','-e',verify).strip())
 report['image']=subprocess.check_output(['docker','image','inspect','rowdy-impossible-v3-validation-quiz','--format','{{.Id}}'],text=True).strip();report['passed']=True
finally:
 print(compose('down'));(root/'organizer/v3-compose-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
