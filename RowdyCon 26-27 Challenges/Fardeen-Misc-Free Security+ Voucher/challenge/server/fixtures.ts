import {createHash} from 'node:crypto';

/** Server-only fixed fixtures. Runtime clients receive only earned/current evidence. */
export type Bitmap = {width:number;height:number;pixels:string};
export const digest = (bytes:string):string => createHash('sha256').update(bytes,'utf8').digest('hex');
export const FINAL_PIN = '604827';
export const MEMO = 'Bob,\nThe audit budget is 48,000. The kickoff meeting cost 47,999.\nKeep this memo private.\n';
export const RELEASES = [
  {id:'rel-v3p9',version:'2.1',filename:'payroll-2.1.release',bytes:'PAYROLL RELEASE\nversion=2.1\nbuild=411\nreview=APPROVED\nrounding=ceiling     \n'},
  {id:'rel-k7m2',version:'2.1',filename:'payroll-2.1.release',bytes:'PAYROLL RELEASE\nversion=2.1\nbuild=410\nreview=APPROVED\nrounding=nearest-even\n'},
  {id:'rel-c8r4',version:'2.1',filename:'payroll-2.1.release',bytes:'PAYROLL RELEASE\nversion=2.1\nbuild=412\nreview=APPROVED\nrounding=floor       \n'}
].map(release=>({...release,sha256:digest(release.bytes),size:Buffer.byteLength(release.bytes)}));
export const APPROVED_RELEASE=RELEASES.find(release=>release.id==='rel-k7m2')!;
export const LATEST_RELEASE_ID='rel-v3p9';

function bitmap(width:number,height:number,paint:(set:(x:number,y:number)=>void)=>void):Bitmap {
  const pixels=Array<string>(width*height).fill('0');
  paint((x,y)=>{if(x>=0&&y>=0&&x<width&&y<height)pixels[y*width+x]='1';});
  return {width,height,pixels:pixels.join('')};
}
function rect(set:(x:number,y:number)=>void,x:number,y:number,w:number,h:number):void {
  for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++)set(col,row);
}
/** Binary seven-segment image; never sent as a prepared reward shortcut. */
export function pinBitmap():Bitmap {
  const segments:Record<string,string>={'0':'abcdef','1':'bc','2':'abdeg','3':'abcdg','4':'bcfg','5':'acdfg','6':'acdefg','7':'abc','8':'abcdefg','9':'abcdfg'};
  return bitmap(144,40,set=>{
    for(const x of [0,137])for(const y of [0,33]){rect(set,x,y,7,1);rect(set,x,y,1,7);}
    [...FINAL_PIN].forEach((digit,i)=>{
      const x=6+i*22,y=6;
      const bars:Record<string,[number,number,number,number]>={a:[3,0,10,3],b:[13,3,3,9],c:[13,15,3,9],d:[3,24,10,3],e:[0,15,3,9],f:[0,3,3,9],g:[3,12,10,3]};
      for(const id of segments[digit]){const [dx,dy,w,h]=bars[id];rect(set,x+dx,y+dy,w,h);}
    });
  });
}
function randomBits(label:string,length:number):string {
  let result='';
  for(let block=0;result.length<length;block++){
    for(const byte of createHash('sha256').update(`SY0-NOPE-v2/${label}/${block}`).digest())result+=byte.toString(2).padStart(8,'0');
  }
  return result.slice(0,length);
}
const target=pinBitmap();
const one=randomBits('token-one',target.pixels.length),two=randomBits('token-two',target.pixels.length);
const three=[...target.pixels].map((pixel,i)=>String(Number(pixel)^Number(one[i])^Number(two[i]))).join('');
const shares=[one,two,three].map(pixels=>({width:target.width,height:target.height,pixels}));
export function tokenShare(index:number):Bitmap {
  if(!Number.isInteger(index)||index<0||index>2)throw new TypeError('Unknown token.');
  return {...shares[index]};
}
const badgeDelta:Array<[number,number]>=[];
for(let y=9;y<15;y++)for(let x=9;x<15;x++)if(x===9||x===14||y===9||y===14)badgeDelta.push([x,y]);
/** Fixed balanced mosaics: raw density does not identify the altered badge. */
export const BADGES = ['A','B','C','D'].map(id=>{
  const approved=bitmap(24,24,set=>{
    for(let x=1;x<23;x++){set(x,1);set(x,22);}for(let y=1;y<23;y++){set(1,y);set(22,y);}
    const interior:Array<[number,number]>=[];
    for(let y=2;y<22;y++)for(let x=2;x<22;x++)if(!badgeDelta.some(([dx,dy])=>dx===x&&dy===y))interior.push([x,y]);
    const paintBalanced=(cells:Array<[number,number]>,count:number)=>{
      const ranked=cells.map(([x,y])=>({x,y,rank:digest(`badge-v4/${id}/${x}/${y}`)})).sort((a,b)=>a.rank.localeCompare(b.rank));
      for(const cell of ranked.slice(0,count))set(cell.x,cell.y);
    };
    paintBalanced(interior,190);paintBalanced(badgeDelta,10);
  });
  const current={...approved};
  if(id==='C'){
    const bits=[...current.pixels];
    for(const [x,y] of badgeDelta)bits[y*current.width+x]=bits[y*current.width+x]==='1'?'0':'1';
    current.pixels=bits.join('');
  }
  return {id,approved,current};
});

