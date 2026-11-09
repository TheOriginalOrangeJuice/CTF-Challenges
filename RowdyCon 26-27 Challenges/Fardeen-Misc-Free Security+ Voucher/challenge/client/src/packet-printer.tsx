import React, {useEffect, useId, useRef, useState} from 'react';
import './packet-printer.css';

type Props = {draft:any; facts:any; act:(op:string,args?:any)=>Promise<any>; disabled:boolean};
type NetworkNode = {id:string;label:string;kind:'host'|'router'|'switch';ports:string[];rule:string};
type Trace = {node:string;ttlIn:number;ttlOut:number;event:string;next?:string};
type Page = {ordinal:number;heading:string;bytes:string;jobId?:string};
type Job = {id:string;label:string;pages:Page[]};

function Inspection({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}) {
  const ref=useRef<HTMLDivElement>(null), closeRef=useRef(close), heading=useId();
  closeRef.current=close;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const key=(event:KeyboardEvent)=>{
      if(document.querySelector('.modal-shade'))return;
      if(event.key==='Escape'){
        event.preventDefault();event.stopImmediatePropagation();closeRef.current();
      }
      if(event.key==='Tab'){
        const controls=Array.from(ref.current?.querySelectorAll<HTMLElement>('button,select,textarea,[tabindex="0"]')||[]).filter(el=>!el.hasAttribute('disabled'));
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',key,true);
    return()=>{document.removeEventListener('keydown',key,true);if(previous?.isConnected)previous.focus();};
  },[]);
  return <div className="pp-inspection" role="dialog" aria-modal="true" aria-labelledby={heading} ref={ref}>
    <div className="pp-inspection-heading"><b id={heading}>{title}</b><button type="button" aria-label={`Close ${title}`} onClick={close}>CLOSE ×</button></div>
    <div className="pp-inspection-content" tabIndex={0}>{children}</div>
  </div>;
}

function DeviceArt({kind,server=false}:{kind:string;server?:boolean}) {
  return <svg viewBox="0 0 68 43" aria-hidden="true" focusable="false">
    <g stroke="#231b30" strokeWidth="2.5" strokeLinejoin="round">
      {server?<><path fill="#c9c1dc" d="M20 3h30v36H20z"/><path fill="#eee9f6" d="M24 7h22v10H24zm0 15h22v10H24z"/><path d="M29 12h10m-10 15h10"/><path stroke="#6a9736" d="M42 11v2m0 13v2"/></>:
      kind==='host'?<><path fill="#bcb0d5" d="M10 3h48v29H10z"/><path fill="#e4f6ff" d="M15 8h38v18H15z"/><path d="M34 32v6M23 39h22"/><path fill="#fff3b2" d="M24 12h20v11H24z"/><path strokeWidth="1.5" d="m24 12 10 7 10-7"/></>:
      kind==='router'?<><ellipse fill="#c5b5f2" cx="34" cy="24" rx="28" ry="15"/><path fill="#eee5ff" d="M6 18a28 12 0 0 1 56 0v7a28 12 0 0 1-56 0Z"/><ellipse fill="#e5d4ff" cx="34" cy="18" rx="28" ry="11"/><path stroke="#4327c8" strokeWidth="2" fill="none" d="M19 18h30m-25-4-5 4 5 4m20-8 5 4-5 4M34 9v18m-4-13 4-5 4 5m-8 8 4 5 4-5"/></>:
      <><path fill="#bdc9df" d="m6 16 12-9h43v22L49 37H6Z"/><path fill="#dde8f6" d="M6 16h43v21H6z"/><path fill="#f2f5fb" d="m6 16 12-9h43l-12 9Z"/><path d="m49 16 12-9m-12 9v21"/><path fill="#6f638f" strokeWidth="1.4" d="M12 23h7v7h-7zm12 0h7v7h-7zm12 0h7v7h-7z"/><path stroke="#668f39" strokeWidth="2" d="M13 20h4m8 0h4m8 0h4"/></>}
    </g>
  </svg>;
}

const positions:Record<string,{x:number;y:number}>={PC:{x:32,y:73},R1:{x:171,y:26},S1:{x:65,y:146},S2:{x:171,y:146},S3:{x:278,y:146},SERVER:{x:310,y:73}};
function cable(from:string,to:string) {
  const a=positions[from],b=positions[to];
  if(!a||!b)return '';
  const distance=Math.hypot(b.x-a.x,b.y-a.y),ux=(b.x-a.x)/distance,uy=(b.y-a.y)/distance;
  const offset=(from==='S1'&&to==='S2')||(from==='S2'&&to==='S1')?7:0;
  const x1=a.x+ux*26-uy*offset,y1=a.y+uy*22+ux*offset;
  const x2=b.x-ux*30-uy*offset,y2=b.y-uy*25+ux*offset;
  return `M${x1},${y1}L${x2},${y2}`;
}
const traceEvent:Record<string,string>={origin:'Sent',switch:'Forwarded',expired:'TTL expired — discarded',delivered:'Delivered',loop:'Loop — stopped'};

export function PacketRoute({draft,facts,act,disabled}:Props) {
  const [selected,setSelected]=useState('PC'),[showTrace,setShowTrace]=useState(false);
  const marker=useId().replace(/:/g,'');
  const nodes:NetworkNode[]=facts.nodes||[],edges:{from:string;to:string}[]=facts.edges||[],trace:Trace[]=draft.trace||[];
  const node=nodes.find(n=>n.id===selected)||nodes[0],routes:Record<string,string>=draft.routes||{};
  const last=trace[trace.length-1];
  return <div className="pp-scene pp-packet">
    <div className="pp-packet-heading"><span className="pp-envelope" aria-hidden="true">✉</span><b>{facts.packet?.id||'PACKET'} <span>TTL: {facts.ttl}</span></b><span>Pick a device. Choose its output.</span></div>
    <div className="pp-network" aria-label="Packet forwarding diagram">
      <svg className="pp-cables" viewBox="0 0 342 178" aria-hidden="true" focusable="false">
        <defs><marker id={`${marker}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="context-stroke"/></marker></defs>
        {edges.map(edge=><path key={`${edge.from}-${edge.to}`} d={cable(edge.from,edge.to)} className={`pp-wire ${routes[edge.from]===edge.to?'pp-wire-selected':''}`} markerEnd={`url(#${marker}-arrow)`}/>)}
        {trace.filter(t=>t.next).map((t,i)=><path key={`trace-${i}`} d={cable(t.node,t.next!)} className="pp-wire-trace"/>)}
      </svg>
      {nodes.map(n=>{
        const p=positions[n.id];if(!p)return null;
        return <button type="button" key={n.id} className={`pp-device ${selected===n.id?'pp-device-selected':''} ${draft.packet?.at===n.id?'pp-device-last':''}`} style={{left:p.x-31,top:p.y-25}} aria-label={`Inspect ${n.id}`} aria-pressed={selected===n.id} onClick={()=>setSelected(n.id)}>
          <DeviceArt kind={n.kind} server={n.id==='SERVER'}/><b>{n.id}</b>
          {draft.packet?.at===n.id&&<span className="pp-arrived" key={JSON.stringify(trace)} aria-label={`Last packet TTL ${draft.packet.ttl}`}>✉ {draft.packet.ttl}</span>}
        </button>;
      })}
    </div>
    {node&&<section className="pp-device-inspector" aria-label={`${node.id} forwarding controls`}>
      <b>{node.id} <span>{node.kind==='router'?'IP ROUTER':node.kind==='switch'?'L2 SWITCH':node.id==='PC'?'YOUR PC':'DESTINATION'}</span></b>
      <p>{node.rule}</p>
      {node.ports.length>0?<><small>OUTPUT PORT</small><div className="pp-port-options">{node.ports.map(to=><button type="button" key={to} disabled={disabled} aria-label={`Route ${node.id} to ${to}`} aria-pressed={routes[node.id]===to} onClick={()=>void act('route',{from:node.id,to})}><span aria-hidden="true">{routes[node.id]===to?'●':'○'}</span> {to} <span aria-hidden="true">→</span></button>)}</div></>:<div className="pp-server-address">TO: SERVER<br/><span>Inbox waiting…</span></div>}
    </section>}
    <div className="pp-network-footer">
      <div className="pp-last-trace">{last?<><span>{traceEvent[last.event]||last.event} at {last.node}</span><button type="button" onClick={()=>setShowTrace(true)} aria-label="Inspect last packet trace">TRACE · TTL {last.ttlOut} ↗</button></>:<span>Blue wire = selected output<br/>Arrow = forwarding direction</span>}</div>
      <button type="button" className="pp-commit" disabled={disabled} onClick={()=>void act('launch')}>LAUNCH PACKET <span aria-hidden="true">➜</span></button>
    </div>
    {showTrace&&<Inspection title="Last packet trace" close={()=>setShowTrace(false)}>
      <p className="pp-evidence-note">{draft.packet?.id}: {draft.packet?.source} → {draft.packet?.destination}. These are the devices the last launch actually visited.</p>
      <table className="pp-trace-table"><thead><tr><th>Device</th><th>TTL in → out</th><th>What happened</th></tr></thead><tbody>{trace.map((t,i)=><tr key={i}><td>{t.node}</td><td>{t.ttlIn} → {t.ttlOut}</td><td>{traceEvent[t.event]||t.event}{t.next?` → ${t.next}`:''}</td></tr>)}</tbody></table>
      <label className="pp-bytes-label">PACKET PAYLOAD<textarea readOnly value={draft.packet?.payload||''} aria-label="Last packet payload"/></label>
    </Inspection>}
  </div>;
}

function Sheet({page,small=false}:{page:Page;small?:boolean}) {
  const body=page.bytes.startsWith(page.heading+'\n')?page.bytes.slice(page.heading.length+1):page.bytes;
  return <div className={`pp-paper ${small?'pp-paper-small':''}`}><b>{page.heading}</b><p>{body}</p></div>;
}
function PageEvidence({page,caption}:{page:Page;caption:string}) {
  return <section className="pp-sheet-evidence"><b>{caption}</b><span>Document position: {page.ordinal} / 4{page.jobId?` · Job: ${page.jobId}`:''}</span><pre tabIndex={0}>{page.bytes}</pre></section>;
}

export function PrinterSpool({draft,facts,act,disabled}:Props) {
  const [viewPage,setViewPage]=useState(1),[inspection,setInspection]=useState<'document'|'host'|'printer'|'output'|null>(null);
  const pages:Page[]=facts.document?.pages||[],host:Job[]=draft.hostQueue||[],buffer:Page[]=draft.printerBuffer||[],output:Page[]=draft.output||[];
  const page=pages.find(p=>p.ordinal===viewPage)||pages[0],settings=draft.settings||{page:1,copies:1};
  const titles={document:'Document pages',host:'PC print queue',printer:'Printer buffer',output:'Printed output'};
  return <div className="pp-scene pp-print">
    <section className="pp-document" aria-label="Document viewer">
      <div className="pp-document-bar">final-final.pdf <button type="button" onClick={()=>setInspection('document')} aria-label="Inspect document pages">↗</button></div>
      {page&&<Sheet page={page}/>}<span className="pp-document-fold" aria-hidden="true"/>
      <div className="pp-page-navigation"><button type="button" aria-label="Previous document page" disabled={viewPage<=1} onClick={()=>setViewPage(v=>v-1)}>←</button><output aria-label="Document viewer position">{viewPage} OF {pages.length}</output><button type="button" aria-label="Next document page" disabled={viewPage>=pages.length} onClick={()=>setViewPage(v=>v+1)}>→</button></div>
    </section>
    <div className="pp-print-machines">
      <div className="pp-pc">
        <button type="button" className="pp-monitor" onClick={()=>setInspection('host')} aria-label="Inspect PC print queue"><b>PC QUEUE</b><strong>{host.length} {host.length===1?'JOB':'JOBS'}</strong><span>{host.length?host[0].label:'No jobs waiting'}</span><small>INSPECT ↗</small></button>
        <span className="pp-monitor-stand" aria-hidden="true"/>
        <button type="button" className="pp-cancel pp-cancel-host" disabled={disabled||host.length===0} onClick={()=>void act('cancel-host')} aria-label="Cancel PC queue">CANCEL QUEUE</button>
      </div>
      <svg className="pp-printer-cord" viewBox="0 0 45 70" aria-hidden="true" focusable="false"><path d="M2 10h11v47h25"/><path d="m32 51 6 6-6 6"/></svg>
      <div className={`pp-printer ${output.length?'pp-printer-used':''}`}>
        <span className="pp-feed-sheet" aria-hidden="true">{buffer.length?buffer[0].heading:'—'}</span>
        <button type="button" className="pp-printer-body" onClick={()=>setInspection('printer')} aria-label="Inspect printer buffer"><span className="pp-printer-top" aria-hidden="true"/><span className="pp-printer-led" aria-hidden="true"/><b>PRINTER BUFFER</b><strong>{buffer.length} {buffer.length===1?'PAGE':'PAGES'}</strong><small>INSPECT ↗</small><span className="pp-output-slot" aria-hidden="true"/></button>
        {output.length>0&&<span key={output.length} className="pp-new-sheet" aria-hidden="true">{output[output.length-1].heading}</span>}
        <button type="button" className="pp-cancel pp-cancel-printer" disabled={disabled||buffer.length===0} onClick={()=>void act('cancel-printer')} aria-label="Cancel printer buffer">CANCEL BUFFER</button>
      </div>
    </div>
    <div className="pp-output-tools"><button type="button" className="pp-output-link" onClick={()=>setInspection('output')} aria-label="Inspect printed output">OUTPUT TRAY: {output.length} {output.length===1?'SHEET':'SHEETS'} ↗</button>{output.length>0&&<button type="button" className="pp-reset" disabled={disabled} onClick={()=>void act('reset-demo')} aria-label="Reset printer demo">RESET DEMO</button>}</div>
    <div className="pp-print-settings"><label>PAGE <select aria-label="Print page" disabled={disabled} value={settings.page} onChange={e=>void act('settings',{page:Number(e.target.value),copies:settings.copies})}>{pages.map(p=><option key={p.ordinal} value={p.ordinal}>{p.ordinal}</option>)}</select></label><label>COPIES <select aria-label="Copies" disabled={disabled} value={settings.copies} onChange={e=>void act('settings',{page:settings.page,copies:Number(e.target.value)})}>{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label></div>
    <button type="button" className="pp-commit pp-print-button" disabled={disabled} onClick={()=>void act('print')}><span aria-hidden="true">▤</span> PRINT</button>
    {inspection&&<Inspection title={titles[inspection]} close={()=>setInspection(null)}>
      {inspection==='document'?<><p className="pp-evidence-note">{facts.document?.title} · Document order</p>{pages.map(p=><PageEvidence key={p.ordinal} page={p} caption={`Page ${p.ordinal} of ${pages.length}`}/>)}</>:
       inspection==='host'?<><p className="pp-evidence-note">{facts.queueRule}</p>{host.length?host.map(job=><section key={job.id}><h3>{job.label} · {job.id}</h3>{job.pages.map((p,i)=><PageEvidence key={i} page={p} caption={`Queued sheet ${i+1}`}/>)}</section>):<p className="pp-empty-evidence">The PC queue is empty.</p>}<button type="button" className="pp-evidence-action" disabled={disabled||host.length===0} onClick={()=>void act('cancel-host')}>CANCEL PC QUEUE</button></>:
       inspection==='printer'?<><p className="pp-evidence-note">{facts.queueRule}</p>{buffer.length?buffer.map((p,i)=><PageEvidence key={i} page={p} caption={`Buffered sheet ${i+1}`}/>):<p className="pp-empty-evidence">The printer buffer is empty.</p>}<button type="button" className="pp-evidence-action" disabled={disabled||buffer.length===0} onClick={()=>void act('cancel-printer')}>CANCEL PRINTER BUFFER</button></>:
       <><p className="pp-evidence-note">{output.length} {output.length===1?'sheet has':'sheets have'} left the printer. The tray keeps every sheet until RESET DEMO.</p>{output.length?output.map((p,i)=><PageEvidence key={i} page={p} caption={`Output sheet ${i+1}`}/>):<p className="pp-empty-evidence">The output tray is empty.</p>}{output.length>0&&<button type="button" className="pp-evidence-action" disabled={disabled} onClick={async()=>{await act('reset-demo');setInspection(null);}}>RESET DEMO</button>}</>}
    </Inspection>}
  </div>;
}
