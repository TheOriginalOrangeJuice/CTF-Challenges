import {createHash,createPrivateKey,createPublicKey,createCipheriv,createDecipheriv,diffieHellman,hkdfSync} from 'node:crypto';
import {MEMO} from './fixtures.js';

/** Fixed, fictional recipient keys. This module is excluded from public assets. */
const key=(label:string)=>createPrivateKey({format:'der',type:'pkcs8',key:Buffer.concat([
  Buffer.from('302e020100300506032b656e04220420','hex'),
  createHash('sha256').update(`SY0-NOPE fictional X25519 key / ${label}`).digest()
])});
const privateKeys={Bob:key('Bob'),Alice:key('Alice')};
const ephemeral=key('sealed-memo fixture');
const encodePublic=(value:ReturnType<typeof createPrivateKey>)=>createPublicKey(value).export({format:'der',type:'spki'}).toString('base64');
export const publicKeys={Bob:encodePublic(privateKeys.Bob),Alice:encodePublic(privateKeys.Alice)};
export type Envelope={recipient:'Bob'|'Alice';algorithm:string;wrappedKey:string;iv:string;ciphertext:string;tag:string};
const aad=Buffer.from('SY0-NOPE memo envelope v2');
function symmetric(privateKey:ReturnType<typeof createPrivateKey>,publicKey:ReturnType<typeof createPublicKey>):Buffer {
  return Buffer.from(hkdfSync('sha256',diffieHellman({privateKey,publicKey}),Buffer.from('SY0-NOPE fixed fictional envelope'),aad,32));
}
/** X25519 key encapsulation plus authenticated encryption, applied to the real memo bytes. */
export function encryptMemo(recipient:'Bob'|'Alice',memo=MEMO):Envelope {
  const symmetricKey=symmetric(ephemeral,createPublicKey(privateKeys[recipient]));
  // A fixed fixture encrypts the same fixed memo; no user text is encrypted with this nonce.
  const iv=createHash('sha256').update(`${recipient}\0${memo}`).digest().subarray(0,12);
  const cipher=createCipheriv('aes-256-gcm',symmetricKey,iv);cipher.setAAD(aad);
  const ciphertext=Buffer.concat([cipher.update(memo,'utf8'),cipher.final()]);
  return {recipient,algorithm:'X25519-HKDF-SHA256 / AES-256-GCM',wrappedKey:encodePublic(ephemeral),iv:iv.toString('base64'),ciphertext:ciphertext.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
}
export function decryptMemo(envelope:Envelope,recipient:'Bob'|'Alice'):Buffer {
  const senderPublic=createPublicKey({format:'der',type:'spki',key:Buffer.from(envelope.wrappedKey,'base64')});
  const decipher=createDecipheriv('aes-256-gcm',symmetric(privateKeys[recipient],senderPublic),Buffer.from(envelope.iv,'base64'));
  decipher.setAAD(aad);decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]);
}
export function isBobsMemo(envelope:Envelope|null):boolean {
  if(!envelope||envelope.recipient!=='Bob')return false;
  try{return decryptMemo(envelope,'Bob').equals(Buffer.from(MEMO,'utf8'));}catch{return false;}
}
