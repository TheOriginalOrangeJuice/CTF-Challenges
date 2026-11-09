import {createHash,createCipheriv,createDecipheriv} from 'node:crypto';

export type ArchiveCipher={algorithm:'AES-256-GCM';iv:string;ciphertext:string;tag:string};
export type ArchiveKey={id:string;location:string;material:string};
const key=createHash('sha256').update('SY0-NOPE v2 private archive key K7').digest();
const archiveBytes=Buffer.from('SY0-NOPE ARCHIVE\nThe payroll audit is filed. The receipts are not getting any prettier.\n');
const iv=createHash('sha256').update('SY0-NOPE archive fixture nonce').digest().subarray(0,12);
const aad=Buffer.from('SY0-NOPE archive K7');
const encoder=createCipheriv('aes-256-gcm',key,iv);encoder.setAAD(aad);
const encoded=Buffer.concat([encoder.update(archiveBytes),encoder.final()]);
const fixedArchive:ArchiveCipher={algorithm:'AES-256-GCM',iv:iv.toString('base64'),ciphertext:encoded.toString('base64'),tag:encoder.getAuthTag().toString('base64')};

/** Actual key records live in private session data, never in the public draft. */
export function newArchiveModel():{archive:ArchiveCipher;keys:ArchiveKey[]} {
  return {archive:{...fixedArchive},keys:[{id:'K7',location:'header',material:key.toString('base64')}]};
}
export function decryptArchive(archive:ArchiveCipher,keyRecord:ArchiveKey):Buffer {
  const decoder=createDecipheriv('aes-256-gcm',Buffer.from(keyRecord.material,'base64'),Buffer.from(archive.iv,'base64'));
  decoder.setAAD(aad);decoder.setAuthTag(Buffer.from(archive.tag,'base64'));
  return Buffer.concat([decoder.update(Buffer.from(archive.ciphertext,'base64')),decoder.final()]);
}
export function archiveRecoverable(archive:ArchiveCipher,keys:ArchiveKey[]):boolean {
  return keys.some(record=>{try{return decryptArchive(archive,record).equals(archiveBytes);}catch{return false;}});
}
export function archiveIntact(archive:ArchiveCipher):boolean {
  return archive.algorithm===fixedArchive.algorithm&&archive.iv===fixedArchive.iv&&archive.ciphertext===fixedArchive.ciphertext&&archive.tag===fixedArchive.tag;
}
