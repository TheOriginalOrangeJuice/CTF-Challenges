import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Database from 'better-sqlite3';
import {buildApp} from '../server/app.js';
import {action,stationSteps} from './steps.js';

const flag='RCC{test_certificate_only}';
async function setup(t:any,dbPath=':memory:'){
  const app=await buildApp({dbPath,flag});t.after(()=>app.close());
  const start=await app.inject({method:'POST',url:'/api/session'});
  assert.equal(start.statusCode,200);const cookie=start.cookies[0];
  return {app,cookie:`${cookie.name}=${cookie.value}`,state:start.json().state};
}
async function advance(app:Awaited<ReturnType<typeof buildApp>>,cookie:string,state:any,last:number){
  for(let q=state.q;q<=last;q++)for(const [op,args] of stationSteps[q]){
    const response=await app.inject({method:'POST',url:'/api/action',headers:{cookie},payload:action(state,'play',{op,args})});
    assert.equal(response.statusCode,200,response.body);state=response.json().state;
  }
  return state;
}

test('session cookie is private, reward is protected and sessions have isolated state',async t=>{
  const {app,cookie,state}=await setup(t);
  const start=await app.inject({method:'POST',url:'/api/session'});assert.equal(start.cookies[0].httpOnly,true);assert.equal(start.cookies[0].sameSite,'Strict');
  const foreignCookie=`${start.cookies[0].name}=${start.cookies[0].value}`;
  const changed=await app.inject({method:'POST',url:'/api/action',headers:{cookie},payload:action(state,'notes',{notes:'Private notebook'})});assert.equal(changed.statusCode,200);
  const other=await app.inject({url:'/api/state',headers:{cookie:foreignCookie}});assert.equal(other.json().state.notes,'');assert.notEqual(other.json().state.attempt,state.attempt);
  assert.equal((await app.inject({url:'/api/reward',headers:{cookie}})).statusCode,403);
  assert.equal((await app.inject({url:'/api/state'})).statusCode,401);
  assert.equal((await app.inject({url:'/api/state',headers:{cookie:'quiz=unknown'}})).statusCode,401);
  assert.equal((await app.inject({url:'/fictional-diagram/debug'})).statusCode,404);
  assert.equal((await app.inject({url:'/server/engine.ts'})).statusCode,404);
});

test('request deduplication returns the original response and never spends another life',async t=>{
  const {app,cookie,state}=await setup(t),payload=action(state,'play',{op:'answer',args:{index:0}});
  const send=()=>app.inject({method:'POST',url:'/api/action',headers:{cookie},payload});
  const [first,second]=await Promise.all([send(),send()]);assert.equal(first.statusCode,200);assert.equal(second.statusCode,200);assert.deepEqual(first.json(),second.json());assert.equal(first.json().state.lives,2);
  const current=(await app.inject({url:'/api/state',headers:{cookie}})).json().state;assert.equal(current.lives,2);assert.equal(current.revision,1);
  const conflicting=await app.inject({method:'POST',url:'/api/action',headers:{cookie},payload:{...payload,args:{index:1}}});assert.equal(conflicting.statusCode,409);assert.equal(conflicting.json().state.lives,2);
});

test('concurrent distinct actions from the same revision serialize and the later one is stale',async t=>{
  const {app,cookie,state}=await setup(t);
  const results=await Promise.all([0,3].map(index=>app.inject({method:'POST',url:'/api/action',headers:{cookie},payload:action(state,'play',{op:'answer',args:{index}})})));
  assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
  const current=(await app.inject({url:'/api/state',headers:{cookie}})).json().state;assert.equal(current.lives,2);assert.equal(current.revision,1);
});

test('immutable attempt/revision/question guards include notes, reset and question-specific actions',async t=>{
  const {app,cookie,state}=await setup(t);
  for(const kind of ['play','notes','restart'] as const){
    for(const fields of [{attempt:'old'},{revision:1},{q:2}]){
      const payload={...action(state,kind,kind==='play'?{op:'answer',args:{index:0}}:kind==='notes'?{notes:'stale'}:{}),...fields};
      const result=await app.inject({method:'POST',url:'/api/action',headers:{cookie},payload});assert.equal(result.statusCode,409);assert.equal(result.json().state.revision,0);
    }
  }
  const reset=await app.inject({method:'POST',url:'/api/action',headers:{cookie},payload:action(state,'restart')});assert.equal(reset.statusCode,200);assert.notEqual(reset.json().state.attempt,state.attempt);
  const stale=await app.inject({method:'POST',url:'/api/action',headers:{cookie},payload:action(state,'play',{op:'answer',args:{index:0}})});assert.equal(stale.statusCode,409);
});

test('malformed requests and unknown operations do not grade, change revisions or accept client verdicts',async t=>{
  const {app,cookie,state}=await setup(t);
  const bodies=[
    {},{...action(state),kind:'draft',draft:{correct:true}},
    action(state,'play',{op:'place-plus',args:{index:'1'}}),
    {...action(state,'play',{op:'answer',args:{index:0}}),correct:true},
    action(state,'play',{op:'unlock',args:{pin:'604827'}}),
    action(state,'notes',{notes:'x'.repeat(8001)})
  ];
  for(const payload of bodies){const result=await app.inject({method:'POST',url:'/api/action',headers:{cookie},payload});assert.equal(result.statusCode,400);assert.equal(result.json().state.lives,3);assert.equal(result.json().state.revision,0);}
  const crossOrigin=await app.inject({method:'POST',url:'/api/action',headers:{cookie,origin:'https://elsewhere.invalid'},payload:action(state,'restart')});assert.equal(crossOrigin.statusCode,403);
});

test('public API complete run, atomic final consumption, reward recovery and retry',async t=>{
  const prepared=await setup(t),{app,cookie}=prepared;let state=prepared.state;
  let finalPayload:any,finalResponse:any;
  for(let q=1;q<=20;q++){
    assert.equal(state.q,q);
    for(const [op,args] of stationSteps[q]){
      const payload=action(state,'play',{op,args});
      const result=await app.inject({method:'POST',url:'/api/action',headers:{cookie},payload});
      assert.equal(result.statusCode,200,result.body);const body=result.json();state=body.state;
      assert.equal(state.lives,3);assert.equal('scouting' in state,false);assert.equal('solved' in state,false);assert.equal('approvedCopy' in state,false);
      assert.equal(state.notebook.some((item:any)=>item.id==='approved-release'),false);
      if(q===20){finalPayload=payload;finalResponse=body;}
    }
    if(q<5)assert.equal(state.tokens.length,0);
    if(q===5)assert.equal(state.tokens.length,1);
    if(q===10)assert.equal(state.tokens.length,2);
    if(q===15)assert.equal(state.tokens.length,3);
  }
  assert.equal(finalResponse.event,'won');assert.equal(state.status,'won');assert.equal(state.earned,true);assert.equal(state.skips,0);assert.ok(state.tokens.every((token:any)=>token.spent));
  const repeated=await app.inject({method:'POST',url:'/api/action',headers:{cookie},payload:finalPayload});assert.deepEqual(repeated.json(),finalResponse);
  const reward=await app.inject({url:'/api/reward',headers:{cookie}});assert.equal(reward.statusCode,200);assert.equal(reward.json().flag,flag);
  const reset=await app.inject({method:'POST',url:'/api/action',headers:{cookie},payload:action(state,'restart')});assert.equal(reset.json().state.q,1);assert.equal(reset.json().state.tokens.length,0);
  assert.equal((await app.inject({url:'/api/reward',headers:{cookie}})).json().flag,flag);
});

test('version 2, 3 and 4 sessions migrate once and delete old deduplication responses',async t=>{
  for(const version of [2,3,4]){
  const dir=mkdtempSync(join(tmpdir(),'quiz-v5-migration-')),path=join(dir,'quiz.sqlite');
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const db=new Database(path);db.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY,state TEXT NOT NULL); CREATE TABLE requests (session TEXT,id TEXT,response TEXT,PRIMARY KEY(session,id));');
  const old={questionVersion:version,attempt:'old-attempt',revision:9,q:20,lives:2,notes:'My handwritten note',notebook:[{id:'approved-release',text:'automatic old solution'}],earned:true};
  db.prepare('INSERT INTO sessions VALUES(?,?)').run('legacy',JSON.stringify(old));db.prepare('INSERT INTO requests VALUES(?,?,?)').run('legacy','old-request',JSON.stringify({state:old,event:'won'}));db.close();
  const app=await buildApp({dbPath:path,flag});
  try{
    const migrated=await app.inject({url:'/api/state',headers:{cookie:'quiz=legacy'}});assert.equal(migrated.statusCode,200);const state=migrated.json().state;
    assert.equal(state.questionVersion,5);assert.equal(state.q,1);assert.equal(state.notes,old.notes);assert.deepEqual(state.notebook,[]);assert.equal(state.earned,false);
    const retried=await app.inject({method:'POST',url:'/api/action',headers:{cookie:'quiz=legacy'},payload:{requestId:'old-request',attempt:'old-attempt',revision:9,q:20,kind:'play',op:'unlock',args:{pin:'604827'}}});assert.equal(retried.statusCode,409);
    const again=await app.inject({url:'/api/state',headers:{cookie:'quiz=legacy'}});assert.equal(again.json().state.attempt,state.attempt);
    assert.equal((await app.inject({url:'/api/reward',headers:{cookie:'quiz=legacy'}})).statusCode,403);
  }finally{await app.close();}
  }
});

test('current v5 private copied bytes, notes, draft and dedupe persist across a service restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'quiz-v5-restart-')),path=join(dir,'quiz.sqlite');let app=await buildApp({dbPath:path,flag});
  try{
    const start=await app.inject({method:'POST',url:'/api/session'}),cookie=`quiz=${start.cookies[0].value}`;
    let state=await advance(app,cookie,start.json().state,10);
    state=(await app.inject({method:'POST',url:'/api/action',headers:{cookie},payload:action(state,'notes',{notes:'My own observation.'})})).json().state;
    const payload=action(state,'play',{op:'hatch',args:{open:false}});
    const saved=(await app.inject({method:'POST',url:'/api/action',headers:{cookie},payload})).json();
    await app.close();app=await buildApp({dbPath:path,flag});
    const restored=(await app.inject({url:'/api/state',headers:{cookie}})).json();assert.deepEqual(restored.state,saved.state);
    const replay=(await app.inject({method:'POST',url:'/api/action',headers:{cookie},payload})).json();assert.deepEqual(replay,saved);
    const deployed=await advance(app,cookie,restored.state,17);assert.equal(deployed.q,18);assert.equal(deployed.lives,3);assert.equal(deployed.notes,'My own observation.');assert.equal('approvedCopy' in deployed,false);
  }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('Q17 two-life penalty is deduplicated and stale or old-version requests cannot spend another life',async t=>{
  const prepared=await setup(t),{app,cookie}=prepared;
  const ready=await advance(app,cookie,prepared.state,16);assert.equal(ready.q,17);
  const payload=action(ready,'play',{op:'deploy',args:{}});
  const send=()=>app.inject({method:'POST',url:'/api/action',headers:{cookie},payload});
  const [first,retry]=await Promise.all([send(),send()]);assert.equal(first.statusCode,200);assert.equal(retry.statusCode,200);assert.deepEqual(first.json(),retry.json());
  const current=first.json().state;assert.equal(current.lives,1);assert.equal(current.q,17);assert.equal('approvedCopy' in current,false);
  assert.equal(current.notebook.some((item:any)=>item.id==='approved-release'),false);
  const stale=await app.inject({method:'POST',url:'/api/action',headers:{cookie},payload:action(ready,'play',{op:'deploy',args:{}})});assert.equal(stale.statusCode,409);assert.equal(stale.json().state.lives,1);
  for(const version of [2,3,4]){const oldVersion=await app.inject({method:'POST',url:'/api/action',headers:{cookie},payload:{...action(current,'play',{op:'deploy',args:{}}),questionVersion:version}});assert.equal(oldVersion.statusCode,409);assert.equal(oldVersion.json().state.lives,1);}
  const recovered=await advance(app,cookie,current,17);assert.equal(recovered.q,18);assert.equal(recovered.lives,1);
});

test('printer and recorder trial mutations and reset are duplicate-safe without refunding failed trials',async t=>{
  for(const q of [12,14]){
    const prepared=await setup(t),{app,cookie}=prepared;
    const ready=await advance(app,cookie,prepared.state,q-1);assert.equal(ready.q,q);
    const payload=action(ready,'play',{op:q===12?'print':'answer',args:q===12?{}:{id:'d'}});
    const send=()=>app.inject({method:'POST',url:'/api/action',headers:{cookie},payload});
    const [first,retry]=await Promise.all([send(),send()]);assert.equal(first.statusCode,200);assert.deepEqual(first.json(),retry.json());
    const failed=first.json().state;assert.equal(failed.lives,2);assert.equal(failed.q,q);
    if(q===12)assert.equal(failed.draft.output.length,3);else assert.equal(failed.draft.tape.split('Biscuit-47').length-1,1);
    const resetPayload=action(failed,'play',{op:'reset-demo',args:{}});
    const reset=await app.inject({method:'POST',url:'/api/action',headers:{cookie},payload:resetPayload});
    const resetRetry=await app.inject({method:'POST',url:'/api/action',headers:{cookie},payload:resetPayload});assert.deepEqual(reset.json(),resetRetry.json());
    const restored=reset.json().state;assert.equal(restored.lives,2);assert.equal(restored.revision,failed.revision+1);
    const finished=await advance(app,cookie,restored,q);assert.equal(finished.q,q+1);assert.equal(finished.lives,2);
  }
});
