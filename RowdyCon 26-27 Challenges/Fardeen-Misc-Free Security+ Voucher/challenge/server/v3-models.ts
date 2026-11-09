import {APPROVED_RELEASE,digest} from './fixtures.js';

export const TYPOGRAPHY=[
  {id:'a',value:'password',fontWeight:400},{id:'b',value:'password',fontWeight:400},
  {id:'c',value:'password',fontWeight:700},{id:'d',value:'password',fontWeight:400}
] as const;
export const EXPRESSIONS=[
  {id:'both-routes',label:'(PASSWORD OR PIN) AND KEY'},
  {id:'password-bypass',label:'PASSWORD OR (PIN AND KEY)'},
  {id:'all-three',label:'PASSWORD AND PIN AND KEY'},
  {id:'either-factor',label:'(PASSWORD OR PIN) OR KEY'}
] as const;
export function expressionValue(id:string,password:boolean,pin:boolean,key:boolean):boolean {
  switch(id){
    case 'both-routes':return (password||pin)&&key;
    case 'password-bypass':return password||(pin&&key);
    case 'all-three':return password&&pin&&key;
    case 'either-factor':return (password||pin)||key;
    default:throw new TypeError('Unknown expression.');
  }
}
export function expressionMatches(id:string):boolean {
  for(const p of [false,true])for(const n of [false,true])for(const k of [false,true]){
    if(expressionValue(id,p,n,k)!==((p||n)&&k))return false;
  }
  return true;
}
export const HOSTNAME='payroll.rowdy.test';
export const LINKS=[
  {id:'a',label:HOSTNAME,url:'https://payroll.rowdy.test.secure-login.test/'},
  {id:'b',label:HOSTNAME,url:'https://payroll.rowdy.test@account-help.test/'},
  {id:'c',label:HOSTNAME,url:'https://payroll.rowdy.test/'},
  {id:'d',label:HOSTNAME,url:'https://payroll-rowdy.test/'}
] as const;
export const DUMMY_PASSWORDS=[
  {id:'a',value:'Crumbs1!'},{id:'b',value:'G00se$oup'},
  {id:'c',value:'h0nkHONK'},{id:'d',value:'Biscuit-47'}
] as const;
export function digitChecksum(value:string):number|null {
  return /^[0-9]{2}$/.test(value)?Number(value[0])+Number(value[1]):null;
}
export type CopyFile={id:string;name:string;kind:'bytes'|'shortcut';size:number;device:string;bytes:string;sha256:string};
const shortcutBytes='LINK device04/payroll-2.1.release\n';
export const SOURCE_FILES:CopyFile[]=[
  {id:'approved',name:APPROVED_RELEASE.filename,kind:'bytes',size:APPROVED_RELEASE.size,device:'04',bytes:APPROVED_RELEASE.bytes,sha256:APPROVED_RELEASE.sha256},
  {id:'shortcut',name:'payroll-2.1.lnk',kind:'shortcut',size:Buffer.byteLength(shortcutBytes),device:'04',bytes:shortcutBytes,sha256:digest(shortcutBytes)}
];
export type LogRecord={id:string;timestamp:string;action:string;previousHash:string|null;bytes:string;sha256:string;anchor:boolean};
export const LOG_TIMESTAMP='09:41:12';
type Evidence={id:string;bytes?:string;sha256?:string};
function fields(bytes:string):Record<string,string> {
  const result:Record<string,string>={};
  for(const line of bytes.split('\n')){const i=line.indexOf('=');if(i>0)result[line.slice(0,i)]=line.slice(i+1);}
  return result;
}
function successor(id:string,action:string,previous:LogRecord):LogRecord {
  const timestamp=LOG_TIMESTAMP,note=action==='DENY'?'request denied':'request allowed';
  const bytes=`FIREWALL EVENT ${id}\ntimestamp=${timestamp}\nsubject=workstation-12\nprotocol=TCP\nport=443\naction=${action}\npreviousHash=${previous.sha256}\nnote=${note}\n`;
  return {id,timestamp,action,previousHash:previous.sha256,bytes,sha256:digest(bytes),anchor:false};
}
/** The acquired Q15 bytes are the checkpoint, not a separately invented lookalike. */
export function logRecords(notebook:Evidence[]):LogRecord[] {
  const evidence=notebook.find(item=>item.id==='denial-tape');
  if(!evidence?.bytes||!evidence.sha256||digest(evidence.bytes)!==evidence.sha256||fields(evidence.bytes).action!=='DENY')return [];
  const anchor:LogRecord={id:'Q15-CHECKPOINT',timestamp:fields(evidence.bytes).timestamp,action:'DENY',previousHash:null,bytes:evidence.bytes,sha256:evidence.sha256,anchor:true};
  const first=successor('EV-R7M','DENY',anchor);
  const second=successor('EV-C2P','DENY',first);
  const third=successor('EV-V8H','ALLOW',second);
  const fourth=successor('EV-N6K','DENY',third);
  const fifth=successor('EV-D9T','DENY',fourth);
  const sixth=successor('EV-B4Q','DENY',fifth);
  const seventh=successor('EV-H3F','ALLOW',sixth);
  return [third,fifth,anchor,sixth,seventh,first,fourth,second];
}
/** Validate exact bytes and follow predecessor links; display order/time do not decide. */
export function latestDenial(records:LogRecord[],notebook:Evidence[]):LogRecord|undefined {
  const evidence=notebook.find(item=>item.id==='denial-tape');
  if(!evidence?.bytes||!evidence.sha256||digest(evidence.bytes)!==evidence.sha256||records.length!==8)return;
  if(new Set(records.map(record=>record.sha256)).size!==records.length)return;
  if(new Set(records.map(record=>record.id)).size!==records.length)return;
  const anchors=records.filter(record=>record.anchor);
  if(anchors.length!==1)return;
  const anchor=anchors[0];
  if(anchor.bytes!==evidence.bytes||anchor.sha256!==evidence.sha256||anchor.previousHash!==null||anchor.action!=='DENY'||fields(anchor.bytes).action!=='DENY'||fields(anchor.bytes).timestamp!==anchor.timestamp)return;
  for(const record of records){
    if(digest(record.bytes)!==record.sha256)return;
    if(!record.anchor){
      const data=fields(record.bytes);
      if(!record.bytes.startsWith(`FIREWALL EVENT ${record.id}\n`)||data.previousHash!==record.previousHash||data.action!==record.action||data.timestamp!==record.timestamp||!['ALLOW','DENY'].includes(data.action))return;
    }
  }
  const seen=new Set<string>([anchor.sha256]);let current=anchor,last=anchor;
  while(true){
    const next=records.filter(record=>record.previousHash===current.sha256);
    if(next.length>1)return;
    if(next.length===0)break;
    current=next[0];if(seen.has(current.sha256))return;seen.add(current.sha256);
    if(fields(current.bytes).action==='DENY')last=current;
  }
  return seen.size===records.length?last:undefined;
}
