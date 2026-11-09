// PNG evidence is decoded into unassociated RGBA BEFORE any browser image surface.
// Intentionally restricted to the documented RGBA8, noninterlaced recovery format.
const signature = [137,80,78,71,13,10,26,10];
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) { crc ^= b; for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
  return (crc^0xffffffff)>>>0;
}
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
export async function decodePNG(buffer) {
  const bytes=new Uint8Array(buffer),dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(!signature.every((v,i)=>bytes[i]===v))throw new Error('This file is not a PNG.');
  let at=8,width=0,height=0,parts=[],ended=false;
  while(at+12<=bytes.length){
    const n=dv.getUint32(at),type=String.fromCharCode(...bytes.subarray(at+4,at+8));
    if(n>bytes.length-at-12)throw new Error('PNG chunk is truncated.');
    const data=bytes.subarray(at+8,at+8+n);
    if(crc32(bytes.subarray(at+4,at+8+n))!==dv.getUint32(at+8+n))throw new Error('PNG checksum mismatch.');
    if(type==='IHDR'){
      if(n!==13)throw new Error('Invalid PNG header.');
      width=dv.getUint32(at+8);height=dv.getUint32(at+12);
      if(!width||!height||width*height>8e6||data[8]!==8||data[9]!==6||data[10]||data[11]||data[12])throw new Error('This inspector supports noninterlaced 8-bit RGBA PNG sources.');
    }
    if(type==='IDAT')parts.push(data);
    if(type==='IEND'){ended=true;break;}
    at+=n+12;
  }
  if(!ended||!width||!parts.length)throw new Error('Incomplete PNG.');
  const stream=new Blob(parts).stream().pipeThrough(new DecompressionStream('deflate'));
  const packed=new Uint8Array(await new Response(stream).arrayBuffer()),stride=width*4;
  if(packed.length!==height*(stride+1))throw new Error('PNG scanline length mismatch.');
  const rgba=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++){
    const filter=packed[y*(stride+1)];
    if(filter>4)throw new Error('Unsupported PNG filter.');
    for(let x=0;x<stride;x++){
      const pos=y*stride+x,a=x>=4?rgba[pos-4]:0,b=y?rgba[pos-stride]:0,c=y&&x>=4?rgba[pos-stride-4]:0;
      const predictor=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];
      rgba[pos]=(packed[y*(stride+1)+1+x]+predictor)&255;
    }
  }
  return {width,height,rgba};
}
export function sourceSurface(source,mode='straight') {
  const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
  const display=new Uint8ClampedArray(source.rgba);
  if(mode==='none')for(let i=3;i<display.length;i+=4)display[i]=255;
  if(mode==='alpha')for(let i=0;i<display.length;i+=4){display[i]=display[i+1]=display[i+2]=display[i+3];display[i+3]=255;}
  canvas.getContext('2d').putImageData(new ImageData(display,source.width,source.height),0,0);
  return canvas;
}
export function paintEvent(ctx,surface,event) {
  const c=event.crop,p=event.placement;
  ctx.save();ctx.translate(p.x+(event.flipX?p.w:0),p.y+(event.flipY?p.h:0));
  ctx.scale(event.flipX?-1:1,event.flipY?-1:1);
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(surface,c.x,c.y,c.w,c.h,0,0,p.w,p.h);ctx.restore();
}
export function validateProject(candidate,original) {
  if(!candidate||candidate.format!==original.format||candidate.revision!==original.revision)throw new Error('Choose a saved project from this recovered montage.');
  if(!Array.isArray(candidate.events)||candidate.events.length!==original.events.length)throw new Error('The project event list is incomplete.');
  const next=structuredClone(original),ids=new Set();
  for(const proposed of candidate.events){
    const event=next.events.find(e=>e.id===proposed.id);
    if(!event||ids.has(proposed.id)||proposed.source!==event.source)throw new Error('The project contains an unknown or duplicated event.');
    ids.add(proposed.id);
    for(const key of ['crop','placement']){
      if(!proposed[key]||!['x','y','w','h'].every(k=>Number.isFinite(proposed[key][k])&&Number.isInteger(proposed[key][k])))throw new Error('Crop and placement values must be whole pixels.');
      const r=proposed[key];
      if(r.w<1||r.h<1||r.w>4096||r.h>4096||Math.abs(r.x)>4096||Math.abs(r.y)>4096)throw new Error('A rectangle is outside the supported range.');
      if(key==='crop'){
        const s=original.sources.find(s=>s.id===event.source);
        if(r.x<0||r.y<0||r.x+r.w>s.width||r.y+r.h>s.height)throw new Error('A crop extends beyond its source image.');
      }
      event[key]={...r};
    }
    for(const key of ['flipX','flipY','visible']){if(typeof proposed[key]!=='boolean')throw new Error('Invalid event switch.');event[key]=proposed[key];}
  }
  if(!candidate.alpha||typeof candidate.alpha!=='object')throw new Error('Missing media interpretation.');
  for(const source of original.sources){if(!['straight','none'].includes(candidate.alpha[source.id]))throw new Error('Invalid alpha interpretation.');next.alpha[source.id]=candidate.alpha[source.id];}
  return next;
}
