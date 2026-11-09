import React,{useEffect,useState} from 'react';
import {Goose} from './art';
import './discovery-scenes.css';
type EvidenceProps={title:string;close:()=>void;children:React.ReactNode};
type Props={draft:any;facts:any;act:(op:string,args?:any)=>Promise<any>;disabled:boolean;Evidence:React.ComponentType<EvidenceProps>};
type Tree={text?:string;tag?:string;attrs?:{class?:string;style?:{fontWeight?:number}};children?:Tree[]};
const escape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function proofSource(node:Tree):string {
 if(node.text!==undefined)return escape(node.text);
 const attrs=node.attrs||{},attributes=(attrs.class?` class="${escape(attrs.class)}"`:'')+(attrs.style?.fontWeight!==undefined?` style="font-weight: ${attrs.style.fontWeight}"`:'');
 return `<${node.tag}${attributes}>${(node.children||[]).map(proofSource).join('')}</${node.tag}>`;
}
function proofTree(node:Tree,key:string):React.ReactNode {
 if(node.text!==undefined)return node.text;
 return React.createElement(node.tag||'span',{key,className:node.attrs?.class,style:node.attrs?.style},...(node.children||[]).map((child,i)=>proofTree(child,key+'-'+i)));
}
export function StrongProof({facts:f,act,disabled,Evidence}:Props){
 const [house,setHouse]=useState(true),[inspected,setInspected]=useState<string|null>(null);
 const selected=f.passwords.find((p:any)=>p.id===inspected);
 return <div className="discovery strong-proof">
  <div className="proof-toolbar"><b>HTML PRINT PROOF</b><button aria-label="Toggle house styling" aria-pressed={house} onClick={()=>setHouse(!house)}>HOUSE STYLE: {house?'ON':'OFF'}</button></div>
  <div className={'proof-cards '+(house?'house-ink':'')}>
   {f.passwords.map((p:any)=><div className="proof-card" key={p.id}><button className="answer" data-answer={p.id} aria-label={`Choose password ${p.id.toUpperCase()}`} disabled={disabled} onClick={()=>void act('answer',{id:p.id})}><small>{p.id.toUpperCase()}</small><span className="password-proof">{proofTree(p.tree,p.id)}</span></button><button className="proof-inspect" aria-label={`Inspect password ${p.id.toUpperCase()} markup`} onClick={()=>setInspected(p.id)}>⟨ / ⟩ PRINT SOURCE</button></div>)}
  </div>
  <div className="proof-goose"><Goose patched/><span>Looks strong to me.</span></div>
  <p className="proof-caption">Tags describe the text. House style supplies the ink.</p>
  {selected&&<Evidence title={`Password ${selected.id.toUpperCase()} · HTML source`} close={()=>setInspected(null)}><p className="proof-context">This fragment draws the password on the card.</p><pre className="proof-code">{proofSource(selected.tree)}</pre><p className="proof-context">House stylesheet: every password is drawn at weight 700 while HOUSE STYLE is on. Inline styles remain in the source.</p></Evidence>}
 </div>;
}
export function VolumePuzzle({draft:d,facts:f,act,disabled}:Props){
 const [tab,setTab]=useState<'sound'|'disk'>('sound'),[start,setStart]=useState(String(d.toolsStart)),[size,setSize]=useState(String(d.cSize)),[mixer,setMixer]=useState(d.mixer);
 useEffect(()=>{setStart(String(d.toolsStart));setSize(String(d.cSize));},[d.toolsStart,d.cSize]);
 useEffect(()=>setMixer(d.mixer),[d.mixer]);
 const go=(op:string,args:any={})=>void act(op,args);
 return <div className="discovery volume-puzzle">
  <div className="volume-toolbar"><b>VOLUME CONTROL</b><span>workstation demo</span></div>
  <div className="volume-tabs"><button aria-pressed={tab==='sound'} onClick={()=>setTab('sound')}>SPEAKERS · {d.mixer}%</button><button aria-pressed={tab==='disk'} aria-label="Open drive C volume" onClick={()=>setTab('disk')}>DRIVE C: · {d.cSize} GB</button></div>
  {tab==='sound'?<div className="mixer-face">
   <svg viewBox="0 0 120 100" aria-hidden="true"><path d="M10 36h25L65 10v80L35 64H10z" fill="#edc2fa" stroke="#3421d8" strokeWidth="5"/>{d.mixer>0&&<path d="M77 32q25 18 0 36M88 20q38 30 0 60" fill="none" stroke="#3421d8" strokeWidth="5"/>}</svg>
   <div><label htmlFor="demo-volume">SPEAKER LEVEL</label><input id="demo-volume" aria-label="Simulated speaker volume" type="range" min="0" max="100" value={mixer} disabled={disabled} onChange={e=>setMixer(Number(e.target.value))} onPointerUp={e=>go('mixer',{value:Number(e.currentTarget.value)})} onKeyUp={e=>go('mixer',{value:Number(e.currentTarget.value)})}/><output>{mixer}%</output><small>One hundred percent employable.</small></div>
   <div className="volume-goose"><Goose patched/></div>
  </div>:<div className="disk-face">
   <div className="disk-key"><span>C: {d.cSize} GB</span><span>TOOLS: 2 GB</span><span>UNALLOCATED: {12-d.cSize-2} GB</span></div>
   <div className="disk-blocks" aria-label="Disk block allocation">{Array.from({length:12},(_,i)=>{const owner=i<d.cSize?'C':i>=d.toolsStart&&i<d.toolsStart+2?'TOOLS':'FREE';return <div key={i} className={'disk-cell '+owner.toLowerCase()} aria-label={`Block ${i}, ${owner}, ${d.blocks[i]?'file data':'no file data'}`}><small>{i}</small><b>{owner==='TOOLS'?'T':owner==='FREE'?'—':'C'}</b><i>{d.blocks[i]?'▰':''}</i></div>})}</div>
   <p className="disk-rule">{f.rule}</p>
   <div className="disk-actions"><label>TOOLS start<input aria-label="TOOLS start block" type="number" min="0" max="10" value={start} onChange={e=>setStart(e.target.value)}/></label><button disabled={disabled} onClick={()=>go('move-tools',{start:Number(start)})}>MOVE TOOLS</button><label>C: size<input aria-label="Drive C size in GB" type="number" min="1" max="12" value={size} onChange={e=>setSize(e.target.value)}/></label><button disabled={disabled} onClick={()=>go('resize-c',{size:Number(size)})}>RESIZE C:</button></div>
  </div>}
  <div className="volume-commit"><span>DRIVE C: {d.cSize} GB · files retained: {d.blocks.filter(Boolean).length}</span><button className="small-answer" disabled={disabled} onClick={()=>go('apply')}>APPLY</button></div>
 </div>;
}
export function RecorderPuzzle({draft:d,facts:f,act,disabled,Evidence}:Props){
 const [reading,setReading]=useState<'tape'|'spool'|null>(null);
 const go=(op:string,args:any={})=>void act(op,args);
 return <div className="discovery capture-puzzle">
  <div className="capture-choices">{f.passwords.map((p:any)=><button className="answer" key={p.id} data-answer={p.id} disabled={disabled} onClick={()=>go('answer',{id:p.id})}>{p.value}</button>)}</div>
  <div className="capture-rule"><b>FINAL TAPE REQUIREMENT</b><p>Your choice must be absent from the final tape, including retained and queued samples.</p><small>Choosing a password drains the spool.</small></div>
  <div className="capture-machine">
   <div className="capture-head"><b>INPUT RECORDER</b><span className="capture-led">● LIVE</span></div>
   <div className="capture-source"><b>SOURCE</b><button aria-pressed={d.source==='input'} disabled={disabled} onClick={()=>go('source',{id:'input'})}>INPUT</button><button aria-pressed={d.source==='aux'} disabled={disabled} onClick={()=>go('source',{id:'aux'})}>AUX</button><small>AUX jack: no source connected</small></div>
   <svg className="capture-wires" viewBox="0 0 250 24" aria-hidden="true"><path d={d.source==='input'?'M38 0v12h87v10':'M104 0v12h21v10'} stroke="#ee4f87" fill="none" strokeWidth="4"/><path d="M125 20h110" stroke="#3323ce" fill="none" strokeWidth="3"/><path d="m230 15 7 5-7 5" stroke="#3323ce" fill="none" strokeWidth="3"/></svg>
   <div className="capture-storage"><button aria-label="Inspect queued samples" onClick={()=>setReading('spool')}><b>SPOOL</b><span>{d.pending.length} queued</span></button><span>→</span><button aria-label="Inspect recorded tape" onClick={()=>setReading('tape')}><b>TAPE</b><span>{new TextEncoder().encode(d.tape).length} bytes</span></button></div>
   <div className="capture-monitor"><span>MONITOR</span><button aria-label={d.paused?'Resume monitor':'Pause monitor'} disabled={disabled} onClick={()=>go('monitor',{paused:!d.paused})}>{d.paused?'▶ RESUME':'Ⅱ PAUSE'}</button><pre aria-label="Recorder monitor">{d.monitorText}</pre></div>
   <button className="capture-reset" disabled={disabled} onClick={()=>go('reset-demo')}>RELOAD DEMO <small>(lives stay spent)</small></button>
  </div>
  {reading&&<Evidence title={reading==='tape'?'Recorded tape · retained bytes':'Spool · queued bytes'} close={()=>setReading(null)}><p className="proof-context">{reading==='tape'?'Retained samples remain on the final tape.':'These samples will drain to tape when you choose a password.'}</p><pre>{reading==='tape'?d.tape:d.pending.join('')}</pre><p className="proof-context">Pausing the monitor freezes its display. The live source and queued bytes remain connected.</p></Evidence>}
 </div>;
}
