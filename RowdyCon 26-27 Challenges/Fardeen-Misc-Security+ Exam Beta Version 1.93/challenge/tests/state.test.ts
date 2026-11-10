import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,migrateState,transition,validateAction,view} from '../server/state.js';
import {APPROVED_RELEASE} from '../server/fixtures.js';
import {action,completeThrough} from './steps.js';

test('full authored run solves nineteen stations, earns exactly three skips and consumes them at certification',()=>{
  const before=completeThrough(19);assert.equal(before.q,20);assert.equal(before.lives,3);assert.equal(before.solved.length,19);
  assert.equal(before.tokens.length,3);assert.equal(view(before).skips,3);assert.equal(before.earned,false);
  assert.deepEqual(before.tokens.map(t=>t.earnedAt),[5,10,15]);
  const won=completeThrough(20,before);assert.equal(won.status,'won');assert.equal(won.earned,true);assert.equal(won.solved.length,20);assert.equal(view(won).skips,0);assert.ok(won.tokens.every(t=>t.spent));
});

test('a wrong commit costs one life, free manipulation never grades, and death does not reset silently',()=>{
  let s=createState();const originalAttempt=s.attempt;
  for(let i=0;i<50;i++){
    const result=transition(s,action(s,'play',{op:'place-plus',args:{index:i%4}}));assert.equal(result.event,'saved');s=result.state;
  }
  assert.equal(s.lives,3);assert.equal(s.q,1);
  for(let i=0;i<3;i++){
    const result=transition(s,action(s,'play',{op:'answer',args:{index:3}}));assert.equal(result.event,i===2?'gameover':'wrong');s=result.state;
  }
  assert.equal(s.status,'gameover');assert.equal(s.attempt,originalAttempt);assert.equal(s.lives,0);
  assert.throws(()=>transition(s,action(s,'play',{op:'place-plus',args:{index:1}})));
  const restarted=transition(s,action(s,'restart')).state;assert.equal(restarted.q,1);assert.equal(restarted.lives,3);assert.equal(restarted.status,'playing');assert.notEqual(restarted.attempt,originalAttempt);
});

test('notes and acquired evidence persist across deaths and full restarts; completions and inventory do not',()=>{
  let s=completeThrough(15);s=transition(s,action(s,'notes',{notes:'My own observations.'})).state;
  assert.equal(s.notebook.some(n=>n.id==='approved-release'),false);assert.equal(s.notebook.some(n=>n.id==='denial-tape'),true);
  assert.equal(s.approvedCopy?.bytes,APPROVED_RELEASE.bytes);
  const notebook=structuredClone(s.notebook),oldAttempt=s.attempt;
  s=transition(s,action(s,'restart')).state;
  assert.equal(s.q,1);assert.equal(s.notes,'My own observations.');assert.deepEqual(s.notebook,notebook);assert.deepEqual(s.solved,[]);assert.deepEqual(s.tokens,[]);assert.notEqual(s.attempt,oldAttempt);
  assert.deepEqual(view(s).tokens,[]);assert.equal(view(s).skips,0);
  assert.equal(s.approvedCopy,null);
});

test('the notebook records acquired objects only; completing early answers adds no automatic solutions',()=>{
  const s=completeThrough(4);assert.deepEqual(s.notebook,[]);assert.deepEqual(view(s).tokens,[]);
  const earned=completeThrough(5,s);assert.equal(earned.notebook.length,1);assert.equal(earned.notebook[0].id,'token-back-1');assert.equal(view(earned).tokens.length,1);
  const publicState=view(earned);assert.equal('solved' in publicState,false);assert.equal('scouting' in publicState,false);assert.equal('eligible' in publicState,false);assert.equal('skipRequirement' in publicState,false);
});

test('a spent skip cannot certify even when the PIN is known, and skip cannot fabricate the missing completion',()=>{
  let s=completeThrough(5);s=transition(s,action(s,'skip')).state;assert.equal(s.q,7);assert.equal(view(s).skips,0);assert.equal(s.solved.includes(6),false);
  s=completeThrough(19,s);assert.equal(s.q,20);assert.equal(s.solved.length,18);assert.equal(view(s).skips,2);
  const result=transition(s,action(s,'play',{op:'unlock',args:{pin:'604827'}}));assert.equal(result.event,'wrong');assert.equal(result.state.earned,false);assert.equal(view(result.state).skips,2);assert.equal(result.state.lives,2);
});

test('finale independently enforces all nineteen unique solves and unspent token inventory',()=>{
  const good=completeThrough(19);
  const cases=[
    {...good,solved:good.solved.slice(1)},
    {...good,solved:[...good.solved.slice(1),19]},
    {...good,tokens:good.tokens.slice(1)},
    {...good,tokens:good.tokens.map((t,i)=>({...t,spent:i===0}))}
  ];
  for(const state of cases){const result=transition(state,action(state,'play',{op:'unlock',args:{pin:'604827'}}));assert.equal(result.event,'wrong');assert.equal(result.state.earned,false);}
  const wrong=transition(good,action(good,'play',{op:'unlock',args:{pin:'000000'}}));assert.equal(wrong.event,'wrong');assert.equal(view(wrong.state).skips,3);
});

test('attempt, revision and question guards reject stale and cross-question actions before changing state',()=>{
  const s=createState();for(const fields of [{attempt:'previous'},{revision:1},{q:2}]){
    const b={...action(s,'play',{op:'answer',args:{index:0}}),...fields};assert.throws(()=>transition(s,b),/Another page/);
  }
  assert.equal(s.lives,3);assert.equal(s.revision,0);
  assert.throws(()=>validateAction({...action(s),kind:'draft',draft:{correct:true}}));
  assert.throws(()=>validateAction({...action(s,'play',{op:'answer',args:{index:0}}),correct:true}));
});

test('pre-v5 migration retains personal notes only and discards old progress, solutions and rewards',()=>{
  const old={attempt:'v1',revision:100,q:20,lives:1,earned:true,notebook:[{text:'old automatic solution'}],notes:'Keep these notes',scouting:true};
  const {state,migrated}=migrateState(old);assert.equal(migrated,true);assert.equal(state.questionVersion,5);assert.equal(state.q,1);assert.equal(state.notes,old.notes);assert.equal(state.earned,false);assert.deepEqual(state.notebook,[]);assert.deepEqual(state.tokens,[]);assert.notEqual(state.attempt,old.attempt);
  assert.equal(migrateState(state).migrated,false);
});

test('earned certificates survive a later fresh attempt without preserving its solved run',()=>{
  const won=completeThrough(20);const restarted=transition(won,action(won,'restart')).state;assert.equal(restarted.earned,true);assert.equal(restarted.status,'playing');assert.deepEqual(restarted.solved,[]);assert.equal(restarted.q,1);
});

test('version 2, 3 and 4 progress, certificates and artifacts migrate once while personal notes remain',()=>{
  for(const version of [2,3,4]){
    const previous={...completeThrough(20),questionVersion:version,notes:'My own note'};
    const result=migrateState(previous);assert.equal(result.migrated,true);assert.equal(result.state.questionVersion,5);
    assert.equal(result.state.q,1);assert.equal(result.state.notes,previous.notes);assert.equal(result.state.earned,false);
    assert.deepEqual(result.state.notebook,[]);assert.deepEqual(result.state.solved,[]);assert.deepEqual(result.state.tokens,[]);assert.equal(result.state.approvedCopy,null);
    assert.equal(migrateState(result.state).migrated,false);
    assert.throws(()=>validateAction({...action(result.state),questionVersion:version}),/older exam/);
  }
});

test('Q10 copy remains private to the verifier and Q17 charges two lives without going negative',()=>{
  const saved=completeThrough(10);assert.deepEqual(saved.approvedCopy,{bytes:APPROVED_RELEASE.bytes,sha256:APPROVED_RELEASE.sha256});
  assert.equal(saved.notebook.some(n=>n.id==='approved-release'),false);assert.equal('approvedCopy' in view(saved),false);
  assert.equal(JSON.stringify(view(saved)).includes(APPROVED_RELEASE.sha256),false);
  const ready=completeThrough(16,saved);assert.equal(ready.q,17);assert.equal('approvalArtifact' in view(ready).facts,false);
  for(const lives of [1,2,3]){
    const s={...structuredClone(ready),lives};
    const wrong=transition(s,action(s,'play',{op:'deploy',args:{}}));
    assert.equal(wrong.state.lives,Math.max(0,lives-2));assert.equal(wrong.event,lives<=2?'gameover':'wrong');
    assert.equal(wrong.state.q,17);assert.match(wrong.message,/TWO LIVES/);assert.equal('approvedCopy' in view(wrong.state),false);
    if(lives===3){const recovered=completeThrough(17,wrong.state);assert.equal(recovered.q,18);assert.equal(recovered.lives,1);}
  }
});


test('Q19 wrong recorder stop costs one life but recording can resume without dooming the run',()=>{
  let s=completeThrough(18);assert.equal(s.q,19);
  const stopped=transition(s,action(s,'play',{op:'recording',args:{on:false}}));assert.equal(stopped.event,'wrong');assert.equal(stopped.state.lives,2);assert.equal(stopped.state.draft.logging,false);s=stopped.state;
  const resumed=transition(s,action(s,'play',{op:'recording',args:{on:true}}));assert.equal(resumed.event,'saved');assert.equal(resumed.state.lives,2);assert.equal(resumed.state.draft.logging,true);
  const completed=completeThrough(20,resumed.state);assert.equal(completed.status,'won');assert.equal(completed.lives,2);
});
