import {buildApp} from './app.js';

const app=await buildApp({
  dbPath:process.env.DB_PATH||'/data/quiz.sqlite',
  publicDir:process.env.PUBLIC_DIR||'dist/public',
  flag:process.env.FLAG||'',
  logger:true,
  cookieSecure:process.env.COOKIE_SECURE==='true',
  publicOrigin:process.env.PUBLIC_ORIGIN
});
await app.listen({port:Number(process.env.PORT||8080),host:'0.0.0.0'});
