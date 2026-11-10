import {createHash,createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';

/** Bounded issuing-office model, not an X.509 stack or a global propagation model. */
export const ISSUER='ROWDY ISSUING CA';
export const ISSUED=[{serial:'CT-2048',subject:'CONTRACTOR',issuer:ISSUER}] as const;
const privateKey=createPrivateKey({format:'der',type:'pkcs8',key:Buffer.concat([
  Buffer.from('302e020100300506032b657004220420','hex'),
  createHash('sha256').update('SY0-NOPE fictional issuing-office Ed25519 key').digest()
])});
const publicKey=createPublicKey(privateKey);
export const issuerPublicKey=publicKey.export({format:'der',type:'spki'}).toString('base64');
export type RevocationPublication={issuer:string;sequence:number;revoked:string[];algorithm:'Ed25519';signature:string};
const signedBytes=(record:Pick<RevocationPublication,'issuer'|'sequence'|'revoked'>)=>Buffer.from(JSON.stringify({issuer:record.issuer,sequence:record.sequence,revoked:record.revoked}));
export function publishRevocations(requested:string[],sequence=1):RevocationPublication {
  const revoked=ISSUED.filter(record=>requested.includes(record.serial)).map(record=>record.serial);
  const payload={issuer:ISSUER,sequence,revoked};
  return {...payload,algorithm:'Ed25519',signature:sign(null,signedBytes(payload),privateKey).toString('base64')};
}
export function authenticRevocation(record:RevocationPublication):boolean {
  try{return record.issuer===ISSUER&&record.algorithm==='Ed25519'&&Number.isSafeInteger(record.sequence)&&record.sequence>=1&&record.revoked.every(serial=>ISSUED.some(issued=>issued.serial===serial))&&verify(null,signedBytes(record),publicKey,Buffer.from(record.signature,'base64'));}catch{return false;}
}
