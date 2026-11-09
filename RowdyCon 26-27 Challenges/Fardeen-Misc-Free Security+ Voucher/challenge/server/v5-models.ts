import {DUMMY_PASSWORDS} from './v3-models.js';

export type ProofNode={text:string}|{tag:'span'|'strong'|'b';attrs?:{class?:string;style?:{fontWeight?:number}};children:ProofNode[]};
export const PASSWORD_TREES:Array<{id:string;tree:ProofNode}>=[
  {id:'a',tree:{tag:'span',children:[{tag:'strong',children:[{text:'pass'}]},{text:'word'}]}},
  {id:'b',tree:{tag:'b',children:[{text:'password'}]}},
  {id:'c',tree:{tag:'span',attrs:{class:'strong'},children:[{text:'password'}]}},
  {id:'d',tree:{tag:'strong',attrs:{style:{fontWeight:400}},children:[{tag:'span',children:[{text:'pass'},{text:'word'}]}]}}
];
export function proofCharacters(tree:ProofNode,strong=false):Array<{character:string;strong:boolean}>{
  if('text' in tree)return [...tree.text].map(character=>({character,strong}));
  return tree.children.flatMap(child=>proofCharacters(child,strong||tree.tag==='strong'));
}
export function wholePasswordStrong(tree:ProofNode):boolean{
  const characters=proofCharacters(tree);
  return characters.length>0&&characters.every(character=>character.strong);
}

export type DiskDraft={mixer:number;toolsStart:number;cSize:number;blocks:Array<string|null>};
export const DISK_FILES=[
  {id:'C',label:'C: / Coursework',blocks:['C0: dissertation.txt\nHONK\n','C1: budget.csv\ncoffee,999\n','C2: final.doc\nfinal means final\n','C3: final-final.doc\nIt did not.\n']},
  {id:'TOOLS',label:'TOOLS / Utilities',blocks:['T0: toolbox.exe\nfixture executable bytes\n','T1: toolbox.cfg\nvolume=drive\n']}
];
export function newDisk():DiskDraft{
  return {mixer:4,toolsStart:4,cSize:4,blocks:[...DISK_FILES[0].blocks,...DISK_FILES[1].blocks,...Array<string|null>(6).fill(null)]};
}
export function moveTools(draft:DiskDraft,start:number):void{
  if(!Number.isInteger(start)||start<0||start>10)throw new TypeError('TOOLS needs two blocks inside this disk.');
  if(start<draft.cSize)throw new TypeError('TOOLS overlaps the allocated C: volume.');
  const previous=draft.toolsStart,bytes=draft.blocks.slice(previous,previous+2);
  for(let position=start;position<start+2;position++){
    if((position<previous||position>=previous+2)&&draft.blocks[position]!==null)throw new TypeError('That destination contains file bytes.');
  }
  draft.blocks[previous]=null;draft.blocks[previous+1]=null;
  draft.blocks[start]=bytes[0];draft.blocks[start+1]=bytes[1];draft.toolsStart=start;
}
export function resizeC(draft:DiskDraft,size:number):void{
  if(!Number.isInteger(size)||size<1||size>12)throw new TypeError('C: must fit inside the twelve-block disk.');
  if(size<DISK_FILES[0].blocks.length)throw new TypeError('The existing C: files need four blocks.');
  if(size>draft.toolsStart)throw new TypeError('C: can extend only into adjacent unallocated blocks. TOOLS is in the way.');
  draft.cSize=size;
}
export function diskFilesIntact(draft:DiskDraft):boolean{
  if(draft.blocks.length!==12||draft.cSize<4||draft.toolsStart<draft.cSize||draft.toolsStart>10)return false;
  const expected:Array<string|null>=Array(12).fill(null);
  DISK_FILES[0].blocks.forEach((bytes,index)=>{expected[index]=bytes;});
  DISK_FILES[1].blocks.forEach((bytes,index)=>{expected[draft.toolsStart+index]=bytes;});
  return expected.every((bytes,index)=>bytes===draft.blocks[index]);
}
export function diskExpanded(draft:DiskDraft):boolean{return draft.cSize===8&&diskFilesIntact(draft);}

export type NetworkNode={id:string;label:string;kind:'host'|'router'|'switch';ports:string[];rule:string};
const switchRule='Layer 2 switching forwards the frame without changing its IP TTL.';
export const NETWORK_NODES:NetworkNode[]=[
  {id:'PC',label:'YOUR PC',kind:'host',ports:['R1','S1'],rule:'Sends the authored packet with TTL 1.'},
  {id:'R1',label:'IP ROUTER',kind:'router',ports:['SERVER','S2'],rule:'IP forwarding subtracts 1 from TTL. A packet reaching 0 is discarded.'},
  {id:'S1',label:'SWITCH 1',kind:'switch',ports:['R1','S2'],rule:switchRule},
  {id:'S2',label:'SWITCH 2',kind:'switch',ports:['S1','S3'],rule:switchRule},
  {id:'S3',label:'SWITCH 3',kind:'switch',ports:['R1','SERVER'],rule:switchRule},
  {id:'SERVER',label:'SERVER',kind:'host',ports:[],rule:'Receives packets addressed to SERVER; reception is not IP forwarding.'}
];
export const NETWORK_EDGES=NETWORK_NODES.flatMap(node=>node.ports.map(to=>({from:node.id,to})));
export const NETWORK_PACKET={id:'PKT-01',source:'PC',destination:'SERVER',payload:'assignment.pdf: submitted before the deadline\n',ttl:1};
export type PacketTrace={node:string;ttlIn:number;ttlOut:number;event:'origin'|'switch'|'expired'|'delivered'|'loop';next?:string};
export type PacketResult=typeof NETWORK_PACKET&{at:string;delivered:boolean};
export type NetworkDraft={routes:Record<string,string>;trace:PacketTrace[];packet:PacketResult|null};
export function newNetwork():NetworkDraft{return {routes:{PC:'R1',R1:'SERVER',S1:'R1',S2:'S1',S3:'R1'},trace:[],packet:null};}
export function routePacket(draft:NetworkDraft,from:string,to:string):void{
  if(!NETWORK_EDGES.some(edge=>edge.from===from&&edge.to===to))throw new TypeError('Those devices have no connecting cable.');
  draft.routes[from]=to;
}
/** A bounded, local graph simulation. No destination is ever fetched. */
export function launchPacket(draft:NetworkDraft):boolean{
  const packet:PacketResult={...NETWORK_PACKET,at:NETWORK_PACKET.source,delivered:false};
  const visited=new Set<string>(),trace:PacketTrace[]=[];
  while(true){
    const node=NETWORK_NODES.find(candidate=>candidate.id===packet.at);
    if(!node)throw new TypeError('The packet reached an unknown device.');
    const ttlIn=packet.ttl;
    if(visited.has(node.id)){trace.push({node:node.id,ttlIn,ttlOut:packet.ttl,event:'loop'});break;}
    visited.add(node.id);
    if(node.id===packet.destination){packet.delivered=packet.ttl>0;trace.push({node:node.id,ttlIn,ttlOut:packet.ttl,event:'delivered'});break;}
    const next=draft.routes[node.id];
    if(!node.ports.includes(next))throw new TypeError('A forwarding port is not connected.');
    if(node.kind==='router'){
      packet.ttl-=1;
      if(packet.ttl<=0){trace.push({node:node.id,ttlIn,ttlOut:packet.ttl,event:'expired'});break;}
    }
    trace.push({node:node.id,ttlIn,ttlOut:packet.ttl,event:node.kind==='host'?'origin':'switch',next});packet.at=next;
  }
  draft.packet=packet;draft.trace=trace;
  return packet.delivered&&packet.at===NETWORK_PACKET.destination&&packet.payload===NETWORK_PACKET.payload;
}

export type DocumentPage={ordinal:number;heading:string;bytes:string};
export type PrintJob={id:string;label:string;pages:DocumentPage[]};
export type PrintedSheet=DocumentPage&{jobId:string};
export type PrinterDraft={settings:{page:number;copies:number};hostQueue:PrintJob[];printerBuffer:PrintedSheet[];output:PrintedSheet[]};
export const PRINT_DOCUMENT={id:'GROUP-PROJECT',title:'Group project: final-final.pdf',pages:[
  {ordinal:1,heading:'PAGE 2',bytes:'PAGE 2\nMeeting about scheduling the next meeting.\n'},
  {ordinal:2,heading:'PAGE 4',bytes:'PAGE 4\nOne person did all the work. The group thanks them.\n'},
  {ordinal:3,heading:'PAGE 1',bytes:'PAGE 1\nReferences: trust me, bro.\n'},
  {ordinal:4,heading:'PAGE 3',bytes:'PAGE 3\nAppendix: another final-final.pdf.\n'}
]};
export function newPrinter():PrinterDraft{
  return {settings:{page:1,copies:1},hostQueue:[{id:'HOST-OLD',label:'Earlier print request',pages:[structuredClone(PRINT_DOCUMENT.pages[3])]}],printerBuffer:[{...PRINT_DOCUMENT.pages[0],jobId:'PRINTER-OLD'}],output:[]};
}
export function printDocument(draft:PrinterDraft):boolean{
  const page=PRINT_DOCUMENT.pages.find(candidate=>candidate.ordinal===draft.settings.page);
  if(!page||!Number.isInteger(draft.settings.copies)||draft.settings.copies<1||draft.settings.copies>3)throw new TypeError('Invalid document print settings.');
  draft.output.push(...structuredClone(draft.printerBuffer));draft.printerBuffer=[];
  for(const job of draft.hostQueue)for(const queuedPage of job.pages)draft.output.push({...structuredClone(queuedPage),jobId:job.id});
  draft.hostQueue=[];
  for(let copy=0;copy<draft.settings.copies;copy++)draft.output.push({...structuredClone(page),jobId:'CURRENT'});
  return draft.output.length===1&&draft.output[0].bytes===PRINT_DOCUMENT.pages[1].bytes&&draft.hostQueue.length===0&&draft.printerBuffer.length===0;
}

export type RecorderDraft={source:'input'|'aux';paused:boolean;tape:string;pending:string[];monitorText:string;selected:string|null};
export function newRecorder():RecorderDraft{
  const tape=DUMMY_PASSWORDS[2].value+'\n';
  return {source:'input',paused:false,tape,pending:DUMMY_PASSWORDS.slice(0,2).map(password=>password.value+'\n'),monitorText:tape,selected:null};
}
export function recordSample(draft:RecorderDraft,id:string):boolean{
  const password=DUMMY_PASSWORDS.find(sample=>sample.id===id);
  if(!password)throw new TypeError('Unknown exam sample.');
  draft.selected=id;
  if(draft.source==='input')draft.pending.push(password.value+'\n');
  draft.tape+=draft.pending.join('');draft.pending=[];
  if(!draft.paused)draft.monitorText=draft.tape;
  return !Buffer.from(draft.tape,'utf8').includes(Buffer.from(password.value,'utf8'));
}
