import {BADGES,FINAL_PIN,RELEASES,APPROVED_RELEASE,LATEST_RELEASE_ID,digest,type Bitmap} from './fixtures.js';
import {EXPRESSIONS,expressionMatches,DUMMY_PASSWORDS,digitChecksum,SOURCE_FILES,LOG_TIMESTAMP,logRecords,latestDenial,type LogRecord} from './v3-models.js';
import {PASSWORD_TREES,wholePasswordStrong,DISK_FILES,newDisk,moveTools,resizeC,diskExpanded,NETWORK_NODES,NETWORK_EDGES,NETWORK_PACKET,newNetwork,routePacket,launchPacket,PRINT_DOCUMENT,newPrinter,printDocument,newRecorder,recordSample,type DiskDraft,type NetworkDraft,type PrinterDraft,type RecorderDraft} from './v5-models.js';
import {ISSUED,ISSUER,authenticRevocation,issuerPublicKey,publishRevocations} from './issuer-model.js';

export type Draft=Record<string,any>;
export type Artifact={id:string;q:number;title:string;text:string;bytes?:string;sha256?:string;bitmap?:Bitmap};
export type ReleaseEvidence={bytes:string;sha256:string};
export type Context={notebook:Artifact[];approvedCopy?:ReleaseEvidence|null};
export type PlayResult={draft:Draft;commit:boolean;correct?:boolean;artifacts?:Artifact[];approvedCopy?:ReleaseEvidence;message?:string};
const clone=<T>(v:T):T=>structuredClone(v);
const ACCOUNTS=['ALICE','BOB','EVE','NOBODY'] as const;
export const RULES=[
  {id:'header',label:'ALLOW ANY',effect:'allow',match:'any'},
  {id:'intern',label:'DENY INTERN',effect:'deny',match:'intern'},
  {id:'staff443',label:'ALLOW STAFF TCP 443',effect:'allow',match:'staff443'},
  {id:'any',label:'ALLOW ANY',effect:'allow',match:'any'},
  {id:'deny',label:'DENY ANY',effect:'deny',match:'any'}
] as const;
export type Traffic={id:string;staff:boolean;intern:boolean;protocol:'TCP'|'UDP';port:number};
export const TRAFFIC:Traffic[]=[
  {id:'EV-1501',staff:true,intern:false,protocol:'TCP',port:443},
  {id:'EV-1502',staff:false,intern:true,protocol:'TCP',port:443},
  {id:'EV-1503',staff:true,intern:true,protocol:'TCP',port:443},
  {id:'EV-1504',staff:false,intern:false,protocol:'TCP',port:443},
  {id:'EV-1505',staff:true,intern:false,protocol:'TCP',port:22},
  {id:'EV-1506',staff:true,intern:false,protocol:'UDP',port:443}
];
export function firstMatch(order:string[],traffic:Traffic):{effect:'allow'|'deny';rule:string} {
  for(const id of order){
    const rule=RULES.find(r=>r.id===id);
    if(!rule)throw new TypeError('Unknown firewall row.');
    if(rule.match==='any'||rule.match==='intern'&&traffic.intern||rule.match==='staff443'&&traffic.staff&&traffic.protocol==='TCP'&&traffic.port===443)return {effect:rule.effect,rule:rule.id};
  }
  return {effect:'deny',rule:'implicit'};
}
export function policyMatches(order:string[]):boolean {
  // Enumerate all equivalence classes of these rule predicates, including overlapping groups.
  for(const staff of [false,true])for(const intern of [false,true])for(const protocol of ['TCP','UDP'] as const)for(const port of [22,443,8443]){
    const packet={id:'policy',staff,intern,protocol,port};
    const expected=staff&&!intern&&protocol==='TCP'&&port===443?'allow':'deny';
    if(firstMatch(order,packet).effect!==expected)return false;
  }
  return true;
}
export function denialTape(order:string[]):string {
  const event=TRAFFIC[1],result=firstMatch(order,event);
  return `FIREWALL EVENT ${event.id}\ntimestamp=${LOG_TIMESTAMP}\nsubject=intern-07\ngroups=intern\nprotocol=${event.protocol}\nport=${event.port}\nrule=${result.rule}\naction=${result.effect.toUpperCase()}\n`;
}
function qcheck(q:number):void {if(!Number.isInteger(q)||q<1||q>20)throw new TypeError('Unknown question.');}
function args(value:unknown,fields:string[]):Draft {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('Arguments must be an object.');
  const proto=Object.getPrototypeOf(value);
  if(proto!==Object.prototype&&proto!==null)throw new TypeError('Arguments must be plain data.');
  const keys=Reflect.ownKeys(value);
  if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!fields.includes(k)))throw new TypeError('Arguments do not match this action.');
  for(const key of fields){const p=Object.getOwnPropertyDescriptor(value,key);if(!p||!('value' in p))throw new TypeError('Arguments must be plain data.');}
  return value as Draft;
}
function text(value:unknown,max=2000):string {if(typeof value!=='string'||value.length>max)throw new TypeError('Text does not fit this field.');return value;}
function choice<T extends string>(value:unknown,values:readonly T[]):T {if(typeof value!=='string'||!values.includes(value as T))throw new TypeError('Unknown choice.');return value as T;}
function bool(value:unknown):boolean {if(typeof value!=='boolean')throw new TypeError('Expected an on/off value.');return value;}
function integer(value:unknown,min:number,max:number):number {if(typeof value!=='number'||!Number.isInteger(value)||value<min||value>max)throw new TypeError('Unknown position.');return value;}
function permutation(value:unknown,ids:readonly string[]):string[] {
  if(!Array.isArray(value)||value.length!==ids.length||new Set(value).size!==ids.length)throw new TypeError('Every row must appear exactly once.');
  return value.map(v=>choice(v,ids));
}

export function initialDraft(q:number,context:Context={notebook:[]}):Draft {
  qcheck(q);
  switch(q){
    case 1:return {plusAt:null};
    case 2:return {inspected:false,installed:'2.1',loaded:'2.0',running:true,restarts:0};
    case 3:return {selected:null};
    case 4:return newDisk();
    case 5:return {allowed:['NOBODY']};
    case 6:return {selected:null};
    case 7:return {password:''};
    case 8:return newNetwork();
    case 9:return {overlay:true,employeeId:'EMP-4107',comment:'Employee EMP-4107 requested this adjustment.',title:'Q4 Budget',budget:'48000'};
    case 10:return {selectedSource:null,clipboard:null,device:'04',copies:{'04':null,'09':null},copied:null,ejected:false};
    case 11:return {outer:false,inner:false,hatch:true,footerOpen:false,candidate:'outside',visitor:'outside'};
    case 12:return newPrinter();
    case 13:return {selected:null};
    case 14:return newRecorder();
    case 15:return {order:RULES.map(r=>r.id)};
    case 16:return {count:'42',checksum:6};
    case 17:return {binding:'LATEST',deployed:null};
    case 18:return {revocations:[],certificatePresent:true,published:[],issuedRecords:['CT-2048']};
    case 19:return {logging:true,records:logRecords(context.notebook),preserved:null};
    case 20:return {pin:''};
    default:throw new TypeError('Unknown question.');
  }
}

export function publicFacts(q:number):Draft {
  qcheck(q);
  switch(q){
    case 1:return {numbers:[20,21,23,25],plusLabel:'+1'};
    case 2:return {service:'Payroll',installedLabel:'Installed files',loadedLabel:'Loaded in running process',choices:[{id:'2.0',label:'2.0'},{id:'2.1',label:'2.1'},{id:'both',label:'BOTH'},{id:'neither',label:'NEITHER'}]};
    case 3:return {passwords:clone(PASSWORD_TREES),context:'HTML proof: inspect the complete markup independently of the house stylesheet.'};
    case 4:return {blockSize:1,totalBlocks:12,files:clone(DISK_FILES),initialBlocks:newDisk().blocks,rule:'C: extends only into immediately following unallocated blocks. Moving TOOLS preserves both of its blocks.'};
    case 5:return {accounts:ACCOUNTS.map(id=>({id,label:id})),policy:'AUTHORIZED ACCOUNTS: 0'};
    case 6:return {expressions:clone(EXPRESSIONS)};
    case 7:return {bracketed:'[ ]',inputLabel:'Exam password'};
    case 8:return {ttl:1,packet:clone(NETWORK_PACKET),nodes:clone(NETWORK_NODES),edges:clone(NETWORK_EDGES)};
    case 9:return {privateFields:['employeeId','comment'],filename:'public-budget.txt'};
    case 10:return {sourcePath:'DEVICE 04 / Approved',files:clone(SOURCE_FILES),devices:[{id:'04',label:'BACKUP FOLDER / DEVICE 04',removable:false},{id:'09',label:'REMOVABLE DRIVE / DEVICE 09',removable:true}]};
    case 11:return {authorized:'C-701',candidate:{id:'C-701',label:'CANDIDATE'},visitor:{id:'V-404',label:'VISITOR'},footerLabel:'FACILITIES'};
    case 12:{const printer=newPrinter();return {document:clone(PRINT_DOCUMENT),initialJobs:{host:printer.hostQueue,printer:printer.printerBuffer},queueRule:'PRINT drains printer memory, then the PC queue, then this request. Canceling one queue does not clear the other.'};}
    case 13:return {badges:clone(BADGES),viewerModes:['approved','current','xor']};
    case 14:return {passwords:clone(DUMMY_PASSWORDS),sources:[{id:'input',label:'INPUT: exam samples'},{id:'aux',label:'AUX: unused jack'}],drainRule:'Submitting a sample drains the pending spool. Your chosen password must be absent from the final tape. PAUSE freezes the monitor only.'};
    case 15:return {rules:clone(RULES),traffic:clone(TRAFFIC),policy:'First matching rule decides. Staff TCP 443 only; interns never; all other traffic denied.'};
    case 16:return {original:'42',checksum:6,algorithm:'sum of the two decimal digits'};
    case 17:return {releases:clone(RELEASES),aliases:{LATEST:LATEST_RELEASE_ID},latest:LATEST_RELEASE_ID};
    case 18:return {issuer:ISSUER,issuerPublicKey,issuedCertificates:clone(ISSUED),serial:'CT-2048',subject:'CONTRACTOR',choices:[{id:'paper',label:'THIS PAPER'},{id:'issuer',label:'ISSUER RECORD'},{id:'both',label:'BOTH'},{id:'neither',label:'NEITHER'}],notice:'The issuer records a revocation; clients learn it when they check the issuer list.'};
    case 19:return {source:'FIREWALL EVENT JOURNAL',recordingLabel:'LIVE LOGGING',hashAlgorithm:'SHA-256',clockNotice:`The journal clock is frozen at ${LOG_TIMESTAMP}; every record has the same timestamp.`,chainLabel:'previousHash identifies the preceding record; each hash covers the exact record bytes.'};
    case 20:return {slots:['SKIP I','SKIP II','SKIP III'],viewer:'XOR: equal pixels cancel. Position and turn the actual token backs.',pinLength:6};
    default:throw new TypeError('Unknown question.');
  }
}

/** Return detached public question data; private cross-question evidence lives in State. */
export function publicDraft(q:number,draft:Draft):Draft {
  qcheck(q);return clone(draft);
}

/** Immutable transition. Only advertised actions can touch the server-owned model. */
export function play(q:number,current:Draft,op:string,rawArgs:unknown,context:Context={notebook:[]}):PlayResult {
  qcheck(q);
  if(typeof op!=='string'||op.length>64)throw new TypeError('Unknown exam action.');
  const d=clone(current),a=rawArgs??{};
  const free=(message?:string):PlayResult=>({draft:d,commit:false,...(message?{message}:{})});
  const commit=(correct:boolean,artifacts?:Artifact[]):PlayResult=>({draft:d,commit:true,correct,...(artifacts?{artifacts}:{})});
  switch(q){
    case 1:
      if(op==='place-plus'){const v=args(a,['index']);d.plusAt=v.index===null?null:integer(v.index,0,3);return free();}
      if(op==='answer'){const v=args(a,['index']),index=integer(v.index,0,3);const numbers=[20,21,23,25];return commit(numbers[index]+(d.plusAt===index?1:0)===22);}
      break;
    case 2:
      if(op==='inspect'){args(a,[]);d.inspected=true;return free();}
      if(op==='answer'){const v=args(a,['id']),id=choice(v.id,['2.0','2.1','both','neither']);return commit(d.running?id===d.loaded:id==='neither');}
      break;
    case 3:
      if(op==='answer'){const v=args(a,['id']),id=choice(v.id,PASSWORD_TREES.map(p=>p.id));d.selected=id;return commit(wholePasswordStrong(PASSWORD_TREES.find(p=>p.id===id)!.tree));}
      break;
    case 4:
      if(op==='mixer'){const v=args(a,['value']);d.mixer=integer(v.value,0,100);return free();}
      if(op==='move-tools'){const v=args(a,['start']);moveTools(d as DiskDraft,integer(v.start,0,10));return free();}
      if(op==='resize-c'){const v=args(a,['size']);resizeC(d as DiskDraft,integer(v.size,1,12));return free();}
      if(op==='apply'){args(a,[]);return commit(diskExpanded(d as DiskDraft));}
      break;
    case 5:
      if(op==='toggle-account'){const v=args(a,['id','allowed']),id=choice(v.id,ACCOUNTS),allowed=bool(v.allowed);d.allowed=d.allowed.filter((account:string)=>account!==id);if(allowed)d.allowed.push(id);return free();}
      if(op==='apply'){args(a,[]);return commit(d.allowed.length===0);}
      break;
    case 6:
      if(op==='answer'){const v=args(a,['id']),id=choice(v.id,EXPRESSIONS.map(e=>e.id));d.selected=id;return commit(expressionMatches(id));}
      break;
    case 7:
      if(op==='submit-password'){const v=args(a,['value']);d.password=text(v.value,128);return commit(Buffer.from(d.password,'utf8').equals(Buffer.from([0x20])));}
      break;
    case 8:
      if(op==='route'){const v=args(a,['from','to']);routePacket(d as NetworkDraft,text(v.from,20),text(v.to,20));return free();}
      if(op==='launch'){args(a,[]);return commit(launchPacket(d as NetworkDraft));}
      break;
    case 9:
      if(op==='overlay'){const v=args(a,['visible']);d.overlay=bool(v.visible);return free();}
      if(op==='edit'){const v=args(a,['field','value']),field=choice(v.field,['employeeId','comment','title','budget']);d[field]=text(v.value);return free();}
      if(op==='publish'){
        args(a,[]);
        const published=`${d.title}\nBudget: ${d.budget}\nEmployee: ${d.employeeId}\nComment: ${d.comment}\n`;
        d.published=published;
        return commit(d.title==='Q4 Budget'&&d.budget==='48000'&&!published.includes('EMP-4107'));
      }
      break;
    case 10:
      if(op==='select-source'){const v=args(a,['id']);d.selectedSource=choice(v.id,['approved','shortcut']);return free();}
      if(op==='copy-file'){args(a,[]);const source=SOURCE_FILES.find(file=>file.id===d.selectedSource);if(!source)throw new TypeError('Select a source file first.');d.clipboard=clone(source);return free();}
      if(op==='select-device'){const v=args(a,['id']);d.device=choice(v.id,['04','09']);d.copied=clone(d.copies[d.device]);d.ejected=false;return free();}
      if(op==='paste-file'){args(a,[]);if(!d.clipboard)throw new TypeError('The clipboard is empty.');d.copies[d.device]={...clone(d.clipboard),device:d.device};d.copied=clone(d.copies[d.device]);d.ejected=false;return free();}
      if(op==='eject'){
        args(a,[]);const file=d.copies['09'];
        const ok=d.device==='09'&&file?.device==='09'&&file?.kind==='bytes'&&file?.bytes===APPROVED_RELEASE.bytes&&file.sha256===digest(file.bytes)&&file.size===Buffer.byteLength(file.bytes);
        d.ejected=ok;
        return {...commit(ok),...(ok?{approvedCopy:{bytes:file.bytes,sha256:digest(file.bytes)}}:{})};
      }
      break;
    case 11:
      if(op==='footer'){const v=args(a,['open']);d.footerOpen=bool(v.open);return free();}
      if(op==='outer'){const v=args(a,['open']);d.outer=bool(v.open);return free();}
      if(op==='hatch'){const v=args(a,['open']);d.hatch=bool(v.open);return free();}
      if(op==='move-person'){
        const v=args(a,['person','to']),person=choice(v.person,['candidate','visitor']),to=choice(v.to,['outside','vestibule']);
        if(d[person]!==to&&!d.outer)throw new TypeError('The outer door is closed.');d[person]=to;return free();
      }
      if(op==='open-inner'){args(a,[]);const ok=d.candidate==='vestibule'&&d.visitor==='outside'&&!d.outer&&!d.hatch;d.inner=ok;return commit(ok);}
      break;
    case 12:
      if(op==='settings'){const v=args(a,['page','copies']);d.settings={page:integer(v.page,1,4),copies:integer(v.copies,1,3)};return free();}
      if(op==='cancel-host'){args(a,[]);d.hostQueue=[];return free();}
      if(op==='cancel-printer'){args(a,[]);d.printerBuffer=[];return free();}
      if(op==='print'){args(a,[]);return commit(printDocument(d as PrinterDraft));}
      if(op==='reset-demo'){args(a,[]);Object.assign(d,newPrinter());return free();}
      break;
    case 13:
      if(op==='answer'){
        const v=args(a,['id']),id=choice(v.id,['A','B','C','D']);d.selected=id;
        const badge=BADGES.find(b=>b.id===id)!;return commit(badge.approved.pixels!==badge.current.pixels);
      }
      break;
    case 14:
      if(op==='monitor'){const v=args(a,['paused']);d.paused=bool(v.paused);if(!d.paused)d.monitorText=d.tape;return free();}
      if(op==='source'){const v=args(a,['id']);d.source=choice(v.id,['input','aux']);return free();}
      if(op==='answer'){const v=args(a,['id']),id=choice(v.id,DUMMY_PASSWORDS.map(password=>password.id));return commit(recordSample(d as RecorderDraft,id));}
      if(op==='reset-demo'){args(a,[]);Object.assign(d,newRecorder());return free();}
      break;
    case 15:
      if(op==='reorder'){const v=args(a,['order']);d.order=permutation(v.order,RULES.map(r=>r.id));return free();}
      if(op==='apply'){
        args(a,[]);d.applied=d.order.slice();d.events=TRAFFIC.map(t=>({...t,...firstMatch(d.order,t)}));
        const ok=policyMatches(d.order),bytes=denialTape(d.order);
        return commit(ok,ok?[{id:'denial-tape',q:15,title:'Firewall denial tape',text:bytes,bytes,sha256:digest(bytes)}]:undefined);
      }
      break;
    case 16:
      if(op==='set-count'){const v=args(a,['value']);d.count=text(v.value,128);d.checksum=digitChecksum(d.count);return free();}
      if(op==='submit-count'){args(a,[]);return commit(d.count!=='42'&&digitChecksum(d.count)===digitChecksum('42'));}
      break;
    case 17:
      if(op==='bind'){const v=args(a,['reference']);d.binding=text(v.reference,200);return free();}
      if(op==='deploy'){
        args(a,[]);const reference=d.binding.trim(),hash=reference.replace(/^sha256:/i,'').toLowerCase();
        const release=RELEASES.find(r=>reference==='LATEST'?r.id===LATEST_RELEASE_ID:r.id===reference||r.sha256===hash);
        if(!release){d.deployed=null;return commit(false);}
        d.deployed={id:release.id,bytes:release.bytes,sha256:digest(release.bytes)};
        const approved=context.approvedCopy;
        return commit(reference!=='LATEST'&&!!approved?.bytes&&Buffer.from(release.bytes).equals(Buffer.from(approved.bytes))&&digest(approved.bytes)===approved.sha256);
      }
      break;
    case 18:
      if(op==='answer'){
        const v=args(a,['id']),id=choice(v.id,['paper','issuer','both','neither']);if(id!=='neither')return commit(false);
        d.revocations=['CT-2048'];d.publication=publishRevocations(d.revocations,(d.publication?.sequence??0)+1);d.published=d.publication.revoked.slice();
        const recordsRetained=d.issuedRecords.length===ISSUED.length&&ISSUED.every(record=>d.issuedRecords.includes(record.serial));
        return commit(d.certificatePresent&&recordsRetained&&authenticRevocation(d.publication)&&d.published.includes('CT-2048'));
      }
      break;
    case 19:
      if(op==='recording'){const v=args(a,['on']);d.logging=bool(v.on);return d.logging?free():commit(false);}
      if(op==='archive-event'){
        const v=args(a,['id']),id=text(v.id,100),selected=(d.records as LogRecord[]).find(record=>record.id===id);
        if(!selected)throw new TypeError('Unknown journal record.');
        d.preserved={id:selected.id,bytes:selected.bytes,sha256:digest(selected.bytes)};
        const expected=latestDenial(d.records,context.notebook);
        const ok=d.logging&&!!expected&&d.preserved.bytes===expected.bytes&&d.preserved.sha256===expected.sha256;
        return commit(ok,ok?[{id:'preserved-denial',q:19,title:'Archived denial',text:'Preserved the latest causal denial; original logging continued.',bytes:selected.bytes,sha256:digest(selected.bytes)}]:undefined);
      }
      break;
    case 20:
      if(op==='unlock'){const v=args(a,['pin']);d.pin=text(v.pin,32);return commit(d.pin===FINAL_PIN);}
      break;
  }
  throw new TypeError('That control does not belong to this question.');
}
