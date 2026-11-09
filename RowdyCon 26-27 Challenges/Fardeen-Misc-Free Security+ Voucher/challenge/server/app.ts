import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import serveStatic from '@fastify/static';
import Database from 'better-sqlite3';
import {createHash,randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {ActionError,createState,migrateState,transition,validateAction,view,type State} from './state.js';

export type AppOptions={dbPath:string;publicDir?:string;flag:string;logger?:boolean;cookieSecure?:boolean;publicOrigin?:string};
function canonical(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value)??'null';
}
export async function buildApp(options:AppOptions){
  if(!/^RCC\{[^\r\n]+\}$/.test(options.flag))throw new Error('Set the private event FLAG before startup.');
  if(options.dbPath!==':memory:')mkdirSync(dirname(options.dbPath),{recursive:true});
  const db=new Database(options.dbPath);db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS requests (session TEXT, id TEXT, response TEXT, fingerprint TEXT, PRIMARY KEY(session,id));');
  const columns=db.prepare('PRAGMA table_info(requests)').all() as {name:string}[];
  if(!columns.some(c=>c.name==='fingerprint'))db.exec('ALTER TABLE requests ADD COLUMN fingerprint TEXT');
  const load=db.prepare('SELECT state FROM sessions WHERE id=?');
  const save=db.prepare('INSERT INTO sessions(id,state) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state');
  const get=(id:string|undefined):State|null=>{
    if(!id)return null;
    const row=load.get(id) as {state:string}|undefined;if(!row)return null;
    const {state,migrated}=migrateState(JSON.parse(row.state));
    if(migrated){save.run(id,JSON.stringify(state));db.prepare('DELETE FROM requests WHERE session=?').run(id);}
    return state;
  };
  const app=Fastify({logger:options.logger??false,bodyLimit:64*1024});
  await app.register(cookie);
  app.addHook('onClose',async()=>{db.close();});
  app.addHook('onRequest',async(req,reply)=>{
    reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','same-origin');
    if(req.url.startsWith('/api/'))reply.header('Cache-Control','no-store');
    if(req.method==='POST'&&req.headers.origin){
      const expected=options.publicOrigin??`${req.protocol}://${req.headers.host}`;
      if(req.headers.origin!==expected)return reply.code(403).send({error:'That request came from another exam room.'});
    }
  });
  app.get('/health',async()=>({ok:true}));
  app.post('/api/session',async(req,reply)=>{
    let id=req.cookies.quiz;
    const state=db.transaction(()=>{
      let state=get(id);
      if(!state){id=randomBytes(32).toString('hex');state=createState();save.run(id,JSON.stringify(state));}
      return state;
    })();
    reply.setCookie('quiz',id!,{path:'/',httpOnly:true,sameSite:'strict',secure:options.cookieSecure??false,maxAge:60*60*24*30});
    return {state:view(state)};
  });
  app.get('/api/state',async(req,reply)=>{
    const state=db.transaction(()=>get(req.cookies.quiz))();
    return state?{state:view(state)}:reply.code(401).send({error:'Start an attempt first.'});
  });
  app.get('/api/reward',async(req,reply)=>{
    const state=db.transaction(()=>get(req.cookies.quiz))();
    if(!state?.earned)return reply.code(403).send({error:'The certificate has not been issued.'});
    return {flag:options.flag};
  });
  app.post('/api/action',async(req,reply)=>{
    const id=req.cookies.quiz;if(!id)return reply.code(401).send({error:'Start an attempt first.'});
    const outcome=db.transaction(()=>{
      const current=get(id);if(!current)return {code:401,body:{error:'Start an attempt first.'}};
      try{
        const body=validateAction(req.body);
        const fingerprint=createHash('sha256').update(canonical(body)).digest('hex');
        const prior=db.prepare('SELECT response,fingerprint FROM requests WHERE session=? AND id=?').get(id,body.requestId) as {response:string;fingerprint:string}|undefined;
        if(prior){
          if(prior.fingerprint!==fingerprint)return {code:409,body:{error:'This request number was already used for another action.',state:view(current)}};
          return {code:200,body:JSON.parse(prior.response)};
        }
        const changed=transition(current,body);
        const response={state:view(changed.state),event:changed.event,message:changed.message};
        save.run(id,JSON.stringify(changed.state));
        db.prepare('INSERT INTO requests(session,id,response,fingerprint) VALUES(?,?,?,?)').run(id,body.requestId,JSON.stringify(response),fingerprint);
        return {code:200,body:response};
      }catch(error){
        if(error instanceof ActionError)return {code:error.status,body:{error:error.message,state:view(current)}};
        throw error;
      }
    })();
    return reply.code(outcome.code).send(outcome.body);
  });
  if(options.publicDir)await app.register(serveStatic,{root:resolve(options.publicDir),index:'index.html',dotfiles:'deny'});
  return app;
}
