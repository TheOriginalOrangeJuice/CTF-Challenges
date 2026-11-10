import test from 'node:test';
import assert from 'node:assert/strict';
import {initialDraft,play,publicDraft,publicFacts} from '../server/engine.js';
import {DUMMY_PASSWORDS} from '../server/v3-models.js';
import {PASSWORD_TREES,proofCharacters,wholePasswordStrong,newDisk,diskFilesIntact,diskExpanded,moveTools,resizeC,NETWORK_NODES,PRINT_DOCUMENT,newRecorder,recordSample,type ProofNode} from '../server/v5-models.js';
import {transition,view} from '../server/state.js';
import {action,completeThrough} from './steps.js';

function station(q:number){
  let draft=initialDraft(q);
  return {get draft(){return draft;},act(op:string,args:unknown={}){const result=play(q,draft,op,args);draft=result.draft;return result;}};
}

test('Q3 grades full real strong ancestry, independently of CSS, class names and inspection history',()=>{
  for(const password of PASSWORD_TREES){
    const characters=proofCharacters(password.tree);
    assert.equal(characters.map(character=>character.character).join(''),'password');
    assert.equal(station(3).act('answer',{id:password.id}).correct,characters.every(character=>character.strong));
  }
  assert.deepEqual(PASSWORD_TREES.map(password=>proofCharacters(password.tree).filter(character=>character.strong).length),[4,0,0,8]);
  const tree:ProofNode={tag:'strong',attrs:{class:'not-strong',style:{fontWeight:100}},children:[{tag:'b',children:[{text:'same'}]},{text:' bytes'}]};
  assert.equal(wholePasswordStrong(tree),true);
  assert.equal(wholePasswordStrong({tag:'span',attrs:{class:'strong',style:{fontWeight:900}},children:[{text:'same bytes'}]}),false);
  assert.equal(wholePasswordStrong({tag:'strong',children:[]}),false);
  const publicTrees=publicFacts(3).passwords;publicTrees[0].tree.children=[];
  assert.equal(proofCharacters(publicFacts(3).passwords[0].tree).length,8);
});

test('Q4 every disk position and capacity respects geometry, and all three eight-GB arrangements preserve bytes',()=>{
  let accepted=0;
  for(let start=0;start<=10;start++)for(let size=1;size<=12;size++){
    const s=station(4),original=structuredClone(s.draft);
    if(start<4){assert.throws(()=>s.act('move-tools',{start}));assert.deepEqual(s.draft,original);continue;}
    const moved=s.act('move-tools',{start});assert.equal(moved.commit,false);assert.equal('correct' in moved,false);
    const beforeResize=structuredClone(s.draft);
    if(size<4||size>start){assert.throws(()=>s.act('resize-c',{size}));assert.deepEqual(s.draft,beforeResize);continue;}
    assert.equal(s.act('resize-c',{size}).commit,false);
    const result=s.act('apply');assert.equal(result.correct,size===8);if(result.correct)accepted++;
    assert.deepEqual(s.draft.blocks.filter((bytes:string|null)=>bytes!==null),original.blocks.filter((bytes:string|null)=>bytes!==null));
  }
  assert.equal(accepted,3);
});

test('Q4 mixer cannot expand storage; overlapping relocation and shrinking preserve actual file bytes',()=>{
  const s=station(4);
  for(const value of [0,8,50,100]){assert.equal(s.act('mixer',{value}).commit,false);assert.equal(s.act('apply').correct,false);assert.equal(s.draft.cSize,4);}
  const d=newDisk();
  for(const start of [5,6,4,10,8]){moveTools(d,start);assert.equal(diskFilesIntact(d),true);}
  resizeC(d,8);assert.equal(diskExpanded(d),true);resizeC(d,4);assert.equal(diskExpanded(d),false);assert.equal(diskFilesIntact(d),true);
  resizeC(d,8);d.blocks[0]='altered file';assert.equal(diskExpanded(d),false);
  const corrupted=newDisk();moveTools(corrupted,8);resizeC(corrupted,8);corrupted.blocks[8]='T0: substitute';assert.equal(diskExpanded(corrupted),false);
  assert.throws(()=>s.act('resize-c',{size:8}));assert.throws(()=>s.act('mixer',{value:101}));assert.throws(()=>s.act('move-tools',{start:8,bytes:[]}));
});

test('Q8 all 32 forwarding configurations simulate actual TTL and accept both irrelevant router settings',()=>{
  const forwarding=NETWORK_NODES.filter(node=>node.ports.length>0);let accepted=0,loops=0,drops=0;
  for(let mask=0;mask<32;mask++){
    const s=station(8);
    forwarding.forEach((node,index)=>{const result=s.act('route',{from:node.id,to:node.ports[(mask>>index)&1]});assert.equal(result.commit,false);assert.equal('correct' in result,false);});
    const r=s.draft.routes,expected=r.PC==='S1'&&r.S1==='S2'&&r.S2==='S3'&&r.S3==='SERVER';
    const result=s.act('launch');assert.equal(result.correct,expected);if(expected)accepted++;
    const trace=s.draft.trace;assert.ok(trace.length<=7);
    for(const hop of trace){assert.equal(hop.ttlIn,1);assert.equal(hop.ttlOut,hop.event==='expired'?0:1);}
    if(expected){assert.deepEqual(trace.map((hop:any)=>hop.node),['PC','S1','S2','S3','SERVER']);assert.equal(s.draft.packet.delivered,true);assert.equal(s.draft.packet.ttl,1);}
    else{assert.equal(s.draft.packet.delivered,false);if(trace.at(-1).event==='loop')loops++;else{assert.equal(trace.at(-1).event,'expired');assert.equal(trace.at(-1).node,'R1');drops++;}}
  }
  assert.equal(accepted,2);assert.ok(loops>0);assert.ok(drops>0);
});

test('Q8 wrong launches retain evidence and routing changes can recover without editing packet TTL',()=>{
  const s=station(8);assert.equal(s.act('launch').correct,false);assert.deepEqual(s.draft.trace.map((hop:any)=>hop.node),['PC','R1']);
  for(const [from,to] of [['PC','S1'],['S1','S2'],['S2','S3'],['S3','SERVER']])s.act('route',{from,to});
  assert.equal(s.act('launch').correct,true);
  assert.throws(()=>s.act('route',{from:'PC',to:'SERVER'}));assert.throws(()=>s.act('route',{from:'SERVER',to:'PC'}));
  assert.throws(()=>s.act('launch',{ttl:2}));assert.throws(()=>s.act('route',{from:'PC',to:'S1',ttl:2}));
});

test('Q12 every page, copy count and pair of queue states is checked against actual emitted sheets',()=>{
  assert.deepEqual(PRINT_DOCUMENT.pages.map(page=>page.heading),['PAGE 2','PAGE 4','PAGE 1','PAGE 3']);let accepted=0;
  for(let page=1;page<=4;page++)for(let copies=1;copies<=3;copies++)for(const hostClear of [false,true])for(const printerClear of [false,true]){
    const s=station(12);s.act('settings',{page,copies});if(hostClear)s.act('cancel-host');if(printerClear)s.act('cancel-printer');
    const result=s.act('print'),expected=page===2&&copies===1&&hostClear&&printerClear;
    assert.equal(result.correct,expected);if(result.correct)accepted++;
    const bytes=[...(!printerClear?[PRINT_DOCUMENT.pages[0].bytes]:[]),...(!hostClear?[PRINT_DOCUMENT.pages[3].bytes]:[]),...Array(copies).fill(PRINT_DOCUMENT.pages[page-1].bytes)];
    assert.deepEqual(s.draft.output.map((sheet:any)=>sheet.bytes),bytes);assert.deepEqual(s.draft.hostQueue,[]);assert.deepEqual(s.draft.printerBuffer,[]);
  }
  assert.equal(accepted,1);
});

test('Q12 cancellation scopes differ and reset restores the same authored trial after bad output',()=>{
  const s=station(12),initial=structuredClone(s.draft);
  s.act('cancel-host');assert.deepEqual(s.draft.printerBuffer,initial.printerBuffer);assert.equal(s.act('print').correct,false);
  assert.ok(s.draft.output.length>1);s.act('settings',{page:2,copies:1});assert.equal(s.act('print').correct,false);
  assert.equal(s.act('reset-demo').commit,false);assert.deepEqual(s.draft,initial);
  s.act('cancel-printer');assert.deepEqual(s.draft.hostQueue,initial.hostQueue);s.act('cancel-host');s.act('settings',{page:2,copies:1});assert.equal(s.act('print').correct,true);
  assert.throws(()=>s.act('settings',{page:0,copies:1}));assert.throws(()=>s.act('settings',{page:2,copies:4}));assert.throws(()=>s.act('cancel-host',{all:true}));
});

test('Q14 capture source and actual FIFO/tape bytes determine every sample result; monitor pause never protects it',()=>{
  for(const source of ['input','aux'])for(const paused of [false,true])for(const password of DUMMY_PASSWORDS){
    const s=station(14),before=structuredClone(s.draft);s.act('source',{id:source});s.act('monitor',{paused});
    const result=s.act('answer',{id:password.id});
    const expectedTape=before.tape+before.pending.join('')+(source==='input'?password.value+'\n':'');
    assert.equal(s.draft.tape,expectedTape);assert.deepEqual(s.draft.pending,[]);
    assert.equal(result.correct,!Buffer.from(expectedTape).includes(Buffer.from(password.value)));
    assert.equal(s.draft.monitorText,paused?before.monitorText:expectedTape);
    s.act('monitor',{paused:false});assert.equal(s.draft.monitorText,s.draft.tape);
  }
});

test('Q14 predicates follow bytes rather than sample IDs, and a failed eligible sample is recoverable',()=>{
  const absent=newRecorder();absent.source='aux';absent.pending=[];assert.equal(recordSample(absent,'a'),true);
  const queued=newRecorder();queued.source='aux';queued.pending.push(DUMMY_PASSWORDS[3].value+'\n');assert.equal(recordSample(queued,'d'),false);
  const s=station(14),initial=structuredClone(s.draft);assert.equal(s.act('answer',{id:'d'}).correct,false);
  s.act('source',{id:'aux'});assert.equal(s.act('answer',{id:'d'}).correct,false);
  s.act('reset-demo');assert.deepEqual(s.draft,initial);s.act('source',{id:'aux'});assert.equal(s.act('answer',{id:'d'}).correct,true);
  assert.throws(()=>s.act('answer',{id:'d',password:'not an exam sample'}));assert.throws(()=>s.act('source',{id:'off'}));assert.throws(()=>s.act('monitor',{paused:1}));assert.throws(()=>s.act('recording',{on:false}));
});

test('Q4 invalid preparation preserves revision/lives; public evidence is a detached copy of actual disk state',()=>{
  const s=completeThrough(3),original=structuredClone(s);assert.equal(s.q,4);
  assert.throws(()=>transition(s,action(s,'play',{op:'resize-c',args:{size:8}})));assert.deepEqual(s,original);
  const changed=transition(s,action(s,'play',{op:'move-tools',args:{start:8}}));assert.equal(changed.event,'saved');assert.equal(changed.state.lives,3);
  const evidence=publicDraft(4,changed.state.draft);evidence.blocks[8]='changed copy';assert.notEqual(changed.state.draft.blocks[8],evidence.blocks[8]);
  assert.equal(view(changed.state).draft.toolsStart,8);
});

test('Q12 and Q14 demo reset preserves the life penalty and permits completion with the authored starting data',()=>{
  for(const q of [12,14]){
    let s=completeThrough(q-1);
    const wrong=transition(s,action(s,'play',{op:q===12?'print':'answer',args:q===12?{}:{id:'d'}}));
    assert.equal(wrong.event,'wrong');assert.equal(wrong.state.lives,2);s=wrong.state;
    const reset=transition(s,action(s,'play',{op:'reset-demo',args:{}}));assert.equal(reset.event,'saved');assert.equal(reset.state.lives,2);assert.deepEqual(reset.state.draft,initialDraft(q));
    s=completeThrough(q,reset.state);assert.equal(s.q,q+1);assert.equal(s.lives,2);
  }
});
