import test from 'node:test';
import assert from 'node:assert/strict';
import {BADGES,RELEASES,APPROVED_RELEASE,digest,pinBitmap,tokenShare} from '../server/fixtures.js';
import {authenticRevocation,ISSUED,publishRevocations} from '../server/issuer-model.js';
import {denialTape,firstMatch,initialDraft,play,policyMatches,publicDraft,publicFacts,RULES,type Artifact,type Draft,type ReleaseEvidence} from '../server/engine.js';
import {EXPRESSIONS,expressionValue,digitChecksum,LOG_TIMESTAMP,logRecords,latestDenial,type LogRecord} from '../server/v3-models.js';

const approved:ReleaseEvidence={bytes:APPROVED_RELEASE.bytes,sha256:APPROVED_RELEASE.sha256};
const tape=denialTape(['intern','staff443','deny','header','any']);
const checkpoint:Artifact={id:'denial-tape',q:15,title:'Checkpoint',text:tape,bytes:tape,sha256:digest(tape)};
function station(q:number,notebook:Artifact[]=[],approvedCopy?:ReleaseEvidence){
  let draft=initialDraft(q,{notebook,approvedCopy});
  return {get draft(){return draft;},act(op:string,args:unknown={}){const result=play(q,draft,op,args,{notebook,approvedCopy});draft=result.draft;return result;}};
}
function permutations<T>(values:T[]):T[][] {return values.length===0?[[]]:values.flatMap((v,i)=>permutations(values.filter((_,j)=>i!==j)).map(rest=>[v,...rest]));}

test('all questions start deterministically, and public evidence contains no verdict or finale PIN',()=>{
  for(let q=1;q<=20;q++){
    const first=initialDraft(q),second=initialDraft(q);assert.deepEqual(first,second);assert.notEqual(first,second);
    assert.equal(JSON.stringify(publicFacts(q)).includes('604827'),false);assert.equal('correct' in publicFacts(q),false);
  }
  const files=publicFacts(10);assert.equal('releases' in files,false);assert.equal(files.files.length,2);
  assert.equal(JSON.stringify(files).includes(RELEASES[0].bytes),false);
});

test('malformed and foreign actions fail without mutating supplied state',()=>{
  for(let q=1;q<=20;q++){
    const d=initialDraft(q),before=structuredClone(d);
    assert.throws(()=>play(q,d,'set-correct',{correct:true}));assert.deepEqual(d,before);
    assert.throws(()=>play(q,d,'answer',{id:'anything',correct:true}));assert.deepEqual(d,before);
  }
  const s=station(1);assert.throws(()=>s.act('place-plus',{index:NaN}));assert.throws(()=>s.act('place-plus',{index:'1'}));
  const getter={};Object.defineProperty(getter,'index',{get:()=>1,enumerable:true});assert.throws(()=>s.act('place-plus',getter));
});

test('Q1 unchanged arithmetic uses the displayed number and reversible plus one',()=>{
  for(let index=0;index<4;index++){
    const s=station(1);assert.equal(s.act('answer',{index}).correct,false);assert.equal(s.act('place-plus',{index}).commit,false);
    assert.equal(s.act('answer',{index}).correct,index===1);
  }
  const s=station(1);s.act('place-plus',{index:1});s.act('place-plus',{index:null});assert.equal(s.act('answer',{index:1}).correct,false);
});

test('Q2 evaluates the actual loaded image, not the installed banner or a required inspection history',()=>{
  const s=station(2),read=s.act('inspect');assert.equal(read.commit,false);assert.equal('correct' in read,false);
  for(const id of ['2.0','2.1','both','neither'])assert.equal(station(2).act('answer',{id}).correct,id==='2.0');
  assert.equal(play(2,{...initialDraft(2),loaded:'2.1'},'answer',{id:'2.1'}).correct,true);
  assert.equal(play(2,{...initialDraft(2),running:false},'answer',{id:'neither'}).correct,true);
  assert.throws(()=>s.act('restart-service'));
});




test('Q5 the account named NOBODY is still an allowed account; only an empty set passes',()=>{
  const s=station(5);assert.deepEqual(s.draft.allowed,['NOBODY']);assert.equal(s.act('apply').correct,false);
  const change=s.act('toggle-account',{id:'NOBODY',allowed:false});assert.equal(change.commit,false);assert.equal('correct' in change,false);
  assert.equal(s.act('apply').correct,true);
  for(const id of ['ALICE','BOB','EVE','NOBODY']){s.act('toggle-account',{id,allowed:true});assert.equal(s.act('apply').correct,false);s.act('toggle-account',{id,allowed:false});}
});

test('Q6 Boolean answers preserve both knowledge alternatives and require possession in every combination',()=>{
  for(const expression of EXPRESSIONS){
    const expected=[false,true].every(p=>[false,true].every(n=>[false,true].every(k=>expressionValue(expression.id,p,n,k)===((p||n)&&k))));
    assert.equal(station(6).act('answer',{id:expression.id}).correct,expected);
  }
  assert.equal(expressionValue('password-bypass',true,false,false),true);
  assert.equal(expressionValue('all-three',true,false,true),false);
});

test('Q7 accepts exactly one ASCII space, not empty input or visually similar Unicode whitespace',()=>{
  for(const value of ['',' ','  ','\t','\n','\u00a0','\u200b',' \n','[ ]','space']){
    const result=station(7).act('submit-password',{value});assert.equal(result.correct,value===' ');assert.equal(result.draft.password,value);
  }
});


test('Q9 the covered identifier and comment both remain in actual published bytes until removed',()=>{
  const s=station(9);assert.equal(s.act('publish').correct,false);assert.match(s.draft.published,/EMP-4107/);
  s.act('overlay',{visible:false});s.act('edit',{field:'employeeId',value:''});assert.equal(s.act('publish').correct,false);
  s.act('edit',{field:'comment',value:''});assert.equal(s.act('publish').correct,true);assert.doesNotMatch(s.draft.published,/EMP-4107/);
  s.act('edit',{field:'budget',value:'0'});assert.equal(s.act('publish').correct,false);
  const redacted=station(9);redacted.act('edit',{field:'employeeId',value:'[redacted]'});redacted.act('edit',{field:'comment',value:'Employee [redacted] requested this adjustment.'});assert.equal(redacted.act('publish').correct,true);
});

test('Q10 the clipboard retains bytes; same-disk backups and shortcuts do not survive Device 04 failure',()=>{
  for(const device of ['04','09'])for(const source of ['approved','shortcut']){
    const s=station(10);s.act('select-source',{id:source});s.act('copy-file');s.act('select-device',{id:device});s.act('paste-file');
    const result=s.act('eject'),correct=device==='09'&&source==='approved';assert.equal(result.correct,correct);
    assert.equal(s.draft.copied.size,Buffer.byteLength(s.draft.copied.bytes));
    assert.equal(result.artifacts,undefined);
    if(correct)assert.deepEqual(result.approvedCopy,approved);else assert.equal(result.approvedCopy,undefined);
  }
  const s=station(10);assert.throws(()=>s.act('copy-file'));assert.throws(()=>s.act('paste-file'));
  s.act('select-source',{id:'approved'});s.act('copy-file');s.act('select-source',{id:'shortcut'});s.act('select-device',{id:'09'});s.act('paste-file');
  assert.equal(s.act('eject').correct,true);
  s.act('select-device',{id:'04'});assert.equal(s.draft.copied,null);s.act('paste-file');assert.equal(s.act('eject').correct,false);
  s.act('select-device',{id:'09'});assert.equal(s.act('eject').correct,true);
});

test('Q11 failed admission keeps the inner door closed and every perimeter error is recoverable',()=>{
  const s=station(11);assert.throws(()=>s.act('move-person',{person:'candidate',to:'vestibule'}));
  s.act('outer',{open:true});s.act('move-person',{person:'candidate',to:'vestibule'});s.act('outer',{open:false});
  assert.equal(s.act('open-inner').correct,false);assert.equal(s.draft.inner,false);
  s.act('hatch',{open:false});assert.equal(s.act('open-inner').correct,true);
  for(const flaw of ['outer','hatch','visitor']){
    const d={...s.draft,[flaw]:flaw==='visitor'?'vestibule':true},result=play(11,d,'open-inner',{});
    assert.equal(result.correct,false);assert.equal(result.draft.inner,false);
  }
  assert.equal(play(11,{...s.draft,footerOpen:false},'open-inner',{}).correct,true);
});


test('Q13 balanced mosaics conceal the changed badge until actual pixel comparison',()=>{
  assert.equal(new Set(BADGES.map(badge=>badge.approved.pixels)).size,4);
  for(const badge of BADGES){
    for(const image of [badge.approved,badge.current]){assert.equal(image.width,24);assert.equal(image.height,24);assert.equal([...image.pixels].filter(p=>p==='1').length,284);}
    const difference=[...badge.approved.pixels].reduce((n,p,i)=>n+(p!==badge.current.pixels[i]?1:0),0);
    assert.equal(difference,badge.id==='C'?20:0);assert.equal(station(13).act('answer',{id:badge.id}).correct,difference>0);
  }
  const published=publicFacts(13);published.badges[0].current.pixels='1';assert.equal(publicFacts(13).badges[0].current.pixels.length,576);
});


test('Q15 all 120 permutations are evaluated with actual first-match semantics and actual denial bytes',()=>{
  const accepted:string[][]=[];
  for(const order of permutations(RULES.map(r=>r.id))){
    const s=station(15);s.act('reorder',{order});const result=s.act('apply');assert.equal(result.correct,policyMatches(order));
    if(result.correct){accepted.push(order);assert.equal(result.artifacts?.[0].bytes,denialTape(order));assert.match(result.artifacts![0].bytes!,/rule=intern\naction=DENY/);}
  }
  assert.deepEqual(accepted,[['intern','staff443','deny','header','any'],['intern','staff443','deny','any','header']]);
  const overlapping={id:'both',staff:true,intern:true,protocol:'TCP' as const,port:443};
  assert.equal(firstMatch(['staff443','intern','deny','header','any'],overlapping).effect,'allow');assert.equal(firstMatch(accepted[0],overlapping).effect,'deny');
});

test('Q16 checksum is an actual digit sum; every two-digit collision except unchanged 42 is accepted',()=>{
  const accepted:string[]=[];
  for(let number=0;number<100;number++){
    const value=String(number).padStart(2,'0'),s=station(16),edit=s.act('set-count',{value});
    assert.equal(edit.commit,false);assert.equal('correct' in edit,false);assert.equal(s.draft.checksum,Number(value[0])+Number(value[1]));
    const result=s.act('submit-count');assert.equal(result.correct,value!=='42'&&digitChecksum(value)===6);if(result.correct)accepted.push(value);
  }
  assert.deepEqual(accepted,['06','15','24','33','51','60']);
  for(const value of ['6','006',' 6','6 ','０６','0\n6','-6','6.','']){const s=station(16);s.act('set-count',{value});assert.equal(s.draft.checksum,null);assert.equal(s.act('submit-count').correct,false);}
});

test('Q17 immutable release IDs and full digest references are equivalent; labels and mutable aliases are not',()=>{
  assert.equal(new Set(RELEASES.map(r=>r.size)).size,1);assert.equal(new Set(RELEASES.map(r=>r.filename)).size,1);assert.equal(new Set(RELEASES.map(r=>r.version)).size,1);
  assert.notEqual(RELEASES[0].id,APPROVED_RELEASE.id);
  for(const reference of ['rel-k7m2',APPROVED_RELEASE.sha256,'sha256:'+APPROVED_RELEASE.sha256,APPROVED_RELEASE.sha256.toUpperCase()]){
    const s=station(17,[],approved);s.act('bind',{reference});assert.equal(s.act('deploy').correct,true);assert.equal(s.draft.deployed.bytes,approved.bytes);
  }
  for(const reference of ['LATEST','2.1','rel-v3p9','rel-c8r4','release-410','unknown']){
    const s=station(17,[],approved);const bound=s.act('bind',{reference});assert.equal(bound.commit,false);assert.equal('correct' in bound,false);assert.equal(s.act('deploy').correct,false);
  }
  const alternate={...approved,bytes:RELEASES[2].bytes,sha256:RELEASES[2].sha256},s=station(17,[],alternate);s.act('bind',{reference:RELEASES[2].sha256});assert.equal(s.act('deploy').correct,true);
  const bad=station(17,[],{...approved,sha256:'0'.repeat(64)});bad.act('bind',{reference:'rel-k7m2'});assert.equal(bad.act('deploy').correct,false);
  const missing=station(17);missing.act('bind',{reference:'rel-k7m2'});assert.equal(missing.act('deploy').correct,false);
  const legacy=station(17,[{id:'approved-release',q:10,title:'Old approval',text:'Old approval',...approved}]);legacy.act('bind',{reference:'rel-k7m2'});assert.equal(legacy.act('deploy').correct,false);
  assert.equal('approvalArtifact' in publicFacts(17),false);assert.equal('approvedCopy' in publicFacts(17),false);
});

test('Q18 no certificate copy must disappear; wrong choices are recoverable and revocation is actually signed',()=>{
  const s=station(18),before=structuredClone(s.draft);
  for(const id of ['paper','issuer','both']){assert.equal(s.act('answer',{id}).correct,false);assert.deepEqual(s.draft,before);}
  assert.equal(s.act('answer',{id:'neither'}).correct,true);assert.equal(s.draft.certificatePresent,true);
  assert.deepEqual(s.draft.published,['CT-2048']);assert.deepEqual(s.draft.issuedRecords,['CT-2048']);assert.equal(authenticRevocation(s.draft.publication),true);
  const record=publishRevocations(['CT-2048']);assert.equal(authenticRevocation({...record,revoked:[]}),false);
  assert.equal(authenticRevocation({...record,issuer:'SOMEONE ELSE'}),false);assert.equal(authenticRevocation({...record,sequence:record.sequence+1}),false);
  assert.deepEqual(publishRevocations(['not-issued']).revoked,[]);assert.deepEqual(ISSUED.map(r=>r.serial),['CT-2048']);
});

test('Q19 eight records share a frozen timestamp and actual predecessor hashes determine causal order',()=>{
  const s=station(19,[checkpoint]),records=s.draft.records as LogRecord[],expected=latestDenial(records,[checkpoint])!;
  assert.equal(expected.id,'EV-B4Q');assert.equal(records.find(r=>r.anchor)!.bytes,checkpoint.bytes);
  assert.equal(records.length,8);assert.equal(records.filter(r=>r.action==='DENY'&&!r.anchor).length,5);assert.equal(records.filter(r=>r.action==='ALLOW').length,2);
  assert.deepEqual([...new Set(records.map(r=>r.timestamp))],[LOG_TIMESTAMP]);
  assert.notEqual(records.filter(r=>r.action==='DENY').at(-1)?.id,expected.id);
  assert.notEqual([...records].filter(r=>!r.anchor&&r.action==='DENY').sort((a,b)=>b.id.localeCompare(a.id))[0].id,expected.id);
  assert.equal(new Set(records.map(r=>r.sha256.slice(0,8))).size,8);
  for(const record of records){assert.equal(record.sha256,digest(record.bytes));assert.equal(station(19,[checkpoint]).act('archive-event',{id:record.id}).correct,record.id===expected.id);}
  for(let i=0;i<records.length;i++){
    const rotated=[...records.slice(i),...records.slice(0,i)];
    assert.equal(latestDenial(rotated,[checkpoint])?.id,expected.id);assert.equal(latestDenial(rotated.reverse(),[checkpoint])?.id,expected.id);
    for(let j=i+1;j<records.length;j++){const swapped=records.slice();[swapped[i],swapped[j]]=[swapped[j],swapped[i]];assert.equal(latestDenial(swapped,[checkpoint])?.id,expected.id);}
  }
  const archived=s.act('archive-event',{id:expected.id});assert.equal(archived.artifacts?.[0].bytes,expected.bytes);assert.equal(archived.artifacts?.[0].sha256,expected.sha256);
});

test('Q19 rejects altered links/bytes and missing anchors, and recorder stop can be recovered',()=>{
  assert.deepEqual(logRecords([]),[]);assert.equal(latestDenial([],[]),undefined);
  const records=logRecords([checkpoint]),changed=structuredClone(records);changed[0].bytes+='changed';assert.equal(latestDenial(changed,[checkpoint]),undefined);
  const forged=structuredClone(records);forged[0].previousHash='0'.repeat(64);assert.equal(latestDenial(forged,[checkpoint]),undefined);
  assert.equal(latestDenial(records,[{...checkpoint,bytes:tape+'modified'}]),undefined);
  const other={...checkpoint,bytes:tape+'source=second-checkpoint\n',sha256:digest(tape+'source=second-checkpoint\n')};
  assert.notEqual(logRecords([other])[0].sha256,records[0].sha256);assert.equal(latestDenial(logRecords([other]),[other])?.id,'EV-B4Q');
  assert.equal(latestDenial(records.slice(1),[checkpoint]),undefined);
  const duplicate=structuredClone(records);duplicate[0].id=duplicate[1].id;assert.equal(latestDenial(duplicate,[checkpoint]),undefined);
  const renamed=structuredClone(records);renamed[0].id='EV-OTHER';assert.equal(latestDenial(renamed,[checkpoint]),undefined);
  const s=station(19,[checkpoint]);assert.equal(s.act('recording',{on:false}).correct,false);assert.equal(s.act('archive-event',{id:'EV-B4Q'}).correct,false);
  const resumed=s.act('recording',{on:true});assert.equal(resumed.commit,false);assert.equal('correct' in resumed,false);assert.equal(s.act('archive-event',{id:'EV-B4Q'}).correct,true);
});

test('Q20 unchanged token shares really XOR into the PIN image',()=>{
  const shares=[0,1,2].map(tokenShare),target=pinBitmap();assert.equal(shares[0].pixels.length,144*40);
  const combined=[...shares[0].pixels].map((p,i)=>String(Number(p)^Number(shares[1].pixels[i])^Number(shares[2].pixels[i]))).join('');
  assert.equal(combined,target.pixels);
  for(const share of shares){assert.notEqual(share.pixels,target.pixels);const density=[...share.pixels].filter(p=>p==='1').length/share.pixels.length;assert.ok(density>.45&&density<.55);}
  assert.equal(station(20).act('unlock',{pin:'604827'}).correct,true);assert.equal(station(20).act('unlock',{pin:'000000'}).correct,false);
  assert.equal(station(20).act('unlock',{pin:' 604827 '}).correct,false);
});
