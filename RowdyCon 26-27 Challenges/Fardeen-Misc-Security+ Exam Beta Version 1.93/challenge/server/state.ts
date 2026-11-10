import {randomUUID} from 'node:crypto';
import {initialDraft,play,publicDraft,publicFacts,type Artifact,type Draft,type ReleaseEvidence} from './engine.js';
import {questions} from './content.js';
import {tokenShare} from './fixtures.js';

export type Token={id:string;earnedAt:number;spent:boolean};
export type State={questionVersion:5;attempt:string;revision:number;q:number;lives:number;status:'playing'|'gameover'|'won';draft:Draft;solved:number[];tokens:Token[];notebook:Artifact[];approvedCopy:ReleaseEvidence|null;notes:string;earned:boolean};
export type Action={requestId:string;attempt:string;revision:number;q:number;questionVersion?:5;kind:'play'|'notes'|'restart'|'skip';op?:string;args?:unknown;notes?:string};
export class ActionError extends Error {constructor(public status:number,message:string){super(message);}}
export function createState(notes=''):State {
  return {questionVersion:5,attempt:randomUUID(),revision:0,q:1,lives:3,status:'playing',draft:initialDraft(1),solved:[],tokens:[],notebook:[],approvedCopy:null,notes,earned:false};
}
export function migrateState(value:unknown):{state:State;migrated:boolean} {
  const old=value as Partial<State>|null;
  if(old?.questionVersion===5)return {state:old as State,migrated:false};
  return {state:createState(typeof old?.notes==='string'?old.notes.slice(0,8000):''),migrated:true};
}
export function view(s:State){
  return {
    attempt:s.attempt,revision:s.revision,questionVersion:5 as const,q:s.q,lives:s.lives,
    skips:s.tokens.filter(t=>!t.spent).length,status:s.status,draft:publicDraft(s.q,s.draft),facts:publicFacts(s.q),
    notebook:structuredClone(s.notebook),notes:s.notes,earned:s.earned,
    tokens:s.tokens.map(t=>({...t,share:tokenShare([5,10,15].indexOf(t.earnedAt))})),
    title:questions[s.q-1][0],subtitle:questions[s.q-1][1]
  };
}
export function validateAction(body:unknown):Action {
  if(!body||typeof body!=='object'||Array.isArray(body))throw new ActionError(400,'The form is damaged. Your lives are safe.');
  const b=body as Record<string,unknown>;
  if(typeof b.requestId!=='string'||b.requestId.length<1||b.requestId.length>100||typeof b.attempt!=='string'||!Number.isSafeInteger(b.revision)||!Number.isSafeInteger(b.q)||!['play','notes','restart','skip'].includes(b.kind as string))throw new ActionError(400,'The form is damaged. Your lives are safe.');
  const allowed=['requestId','attempt','revision','q','questionVersion','kind',...(b.kind==='play'?['op','args']:b.kind==='notes'?['notes']:[])];
  if(Object.keys(b).some(key=>!allowed.includes(key)))throw new ActionError(400,'Unexpected action fields.');
  if(b.questionVersion!==undefined&&b.questionVersion!==5)throw new ActionError(409,'This page belongs to an older exam. Reload the current attempt.');
  if(b.kind==='play'&&(typeof b.op!=='string'||b.op.length>64))throw new ActionError(400,'Unknown exam action.');
  return b as unknown as Action;
}
function acquire(s:State,artifact:Artifact):void {
  const existing=s.notebook.findIndex(n=>n.id===artifact.id);
  if(existing<0)s.notebook.push(structuredClone(artifact));else s.notebook[existing]=structuredClone(artifact);
}
export function transition(current:State,b:Action):{state:State;event:string;message:string} {
  if(b.attempt!==current.attempt||b.revision!==current.revision||b.q!==current.q)throw new ActionError(409,'Another page changed this attempt. Current work restored.');
  const s=structuredClone(current);
  let event='saved',message='';
  if(b.kind==='notes'){
    if(typeof b.notes!=='string'||b.notes.length>8000)throw new ActionError(400,'Notes must fit in eight thousand characters.');
    s.notes=b.notes;
  }else if(b.kind==='restart'){
    const next=createState(s.notes);next.notebook=s.notebook;next.earned=s.earned;
    Object.assign(s,next);event='restart';
  }else{
    if(s.status!=='playing')throw new ActionError(400,'This attempt has ended.');
    if(b.kind==='skip'){
      const token=s.tokens.find(t=>!t.spent);
      if(s.q===20||!token)throw new ActionError(400,'There is no skip available for this question.');
      token.spent=true;s.q++;s.draft=initialDraft(s.q,s);event='skip';
    }else if(b.kind==='play'){
      let result;
      try{result=play(s.q,s.draft,b.op!,b.args??{},s);}catch(error){throw new ActionError(400,error instanceof Error?error.message:'Invalid control.');}
      s.draft=result.draft;message=result.message??'';
      if(result.commit){
        const eligible=s.q!==20||(s.solved.length===19&&Array.from({length:19},(_,i)=>i+1).every(q=>s.solved.includes(q))&&s.tokens.length===3&&s.tokens.every(t=>!t.spent));
        if(result.correct&&eligible){
          s.solved.push(s.q);
          if(result.approvedCopy)s.approvedCopy=structuredClone(result.approvedCopy);
          for(const artifact of result.artifacts??[])acquire(s,artifact);
          if([5,10,15].includes(s.q)){
            const index=[5,10,15].indexOf(s.q);
            s.tokens.push({id:`skip-${index+1}`,earnedAt:s.q,spent:false});
            acquire(s,{id:`token-back-${index+1}`,q:s.q,title:`Skip ${index+1} back`,text:'Acquired token back.',bitmap:tokenShare(index)});
          }
          if(s.q===20){for(const token of s.tokens)token.spent=true;s.status='won';s.earned=true;event='won';}
          else{s.q++;s.draft=initialDraft(s.q,s);event='correct';}
        }else{
          const cost=s.q===17?2:1;
          s.lives=Math.max(0,s.lives-cost);event=s.lives===0?'gameover':'wrong';message=cost===2?'NOPE. TWO LIVES. The goose is furious.':'NOPE. The goose is not impressed.';
          if(s.lives===0)s.status='gameover';
        }
      }
    }
  }
  s.revision++;
  return {state:s,event,message};
}
