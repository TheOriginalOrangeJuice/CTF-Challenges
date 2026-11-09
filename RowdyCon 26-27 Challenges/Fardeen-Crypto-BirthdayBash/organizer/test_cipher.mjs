import assert from 'node:assert/strict';
import fs from 'node:fs';
import {solve,letters,letter,mod} from '../challenge/public/cipher.js';
const data=JSON.parse(fs.readFileSync(new URL('../challenge/public/evidence.json',import.meta.url),'utf8'));
const greeting=Object.fromEntries([...'HELLOHELLO'].map((c,i)=>[i,c]));
const closing=Object.fromEntries([...'GOODNIGHT'].map((c,i)=>[247+i,c]));
assert.equal(letters(data.target.cipher).length,256);
assert.equal(solve(data.target.cipher,greeting).known,10);
assert.equal(solve(data.target.cipher,greeting,'','text',16).known,160);
assert.equal(solve(data.target.cipher,closing,'','text',16).known,144);
const both=solve(data.target.cipher,{...greeting,...closing},'','text',16);
assert.equal(both.known,256);assert.equal(both.conflicts.length,0);
assert.ok(both.text.includes('RCC{STAY_QUIET_VJQZKXMPYBNDFLRAS}'));
assert.equal(both.key.slice(0,16).map(letter).join(''),'QXJMVZPKTRNBYWFS');
assert.equal(solve(data.target.cipher,{},'QXJMVZPKTRNBYWFS','text',16).text,both.text);
assert.equal(solve(data.target.cipher,{...greeting,...closing,16:'Z'},'','text',16).conflicts.length>0,true);
assert.notEqual(solve(data.target.cipher,{...greeting,...closing},'','text',15).text,both.text);
assert.ok(solve(data.target.cipher,{...greeting,...closing},'','text',15).conflicts.length);
assert.ok(solve(data.target.cipher,{...greeting,...closing},'','code',16).conflicts.length);
assert.throws(()=>solve(data.target.cipher,{},'','text',0),RangeError);
assert.equal(solve(data.target.cipher,{},'................').known,0);
const sp=letters(data.sample.plain),sample=solve(data.sample.cipher,Object.fromEntries(sp.map((c,i)=>[i,c])));
assert.equal(sample.conflicts.length,0);assert.equal(sample.text,data.sample.plain);
assert.notEqual(sample.key.slice(0,16).map(letter).join(''),both.key.slice(0,16).map(letter).join(''));
for(let i=16;i<sample.key.length;i++)assert.equal(sample.key[i],sample.plain[i-16]);
// Every letter in each residue independently recovers its full chain, backwards too.
for(let i=0;i<256;i++){const r=solve(data.target.cipher,{[i]:letter(both.plain[i])},'','text',16);assert.equal(r.known,16);for(let j=i%16;j<256;j+=16)assert.equal(r.plain[j],both.plain[j]);}
assert.equal(mod(-1),25);
console.log(JSON.stringify({pass:true,checks:'fixed length, crib coverage, conflict handling, distinct sample, all 256 single-anchor directions'}));
