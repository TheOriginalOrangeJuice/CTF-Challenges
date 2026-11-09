from pathlib import Path
import zlib,struct,json,re
p=Path(__file__).resolve().parent/'original-source'/'original.swf';data=p.read_bytes();data=data[:8]+zlib.decompress(data[8:]) if data[:3]==b'CWS' else data
start=8+(5+4*(data[8]>>3)+7)//8+4
rows=[]
def walk(buf,start,parent):
 at=start;frame=1;label=''
 while at+2<=len(buf):
  w=struct.unpack_from('<H',buf,at)[0];at+=2;code=w>>6;n=w&63
  if n==63:n=struct.unpack_from('<I',buf,at)[0];at+=4
  b=buf[at:at+n];at+=n
  if code==43:
   label=b.rstrip(b'\x00').decode('utf8','replace');rows.append({'parent':parent,'frame':frame,'label':label})
  if code==15:rows.append({'parent':parent,'frame':frame,'label':label,'startSound':struct.unpack_from('<H',b)[0]})
  if code in (56,76):
   off=2
   for _ in range(struct.unpack_from('<H',b)[0]):
    ident=struct.unpack_from('<H',b,off)[0];off+=2;end=b.index(0,off);name=b[off:end].decode('utf8','replace');off=end+1;rows.append({'export':name,'id':ident})
  if code==39:walk(b,4,f'sprite-{struct.unpack_from("<H",b)[0]}')
  if code==1:frame+=1
  if code==0:break
walk(data,start,'root')
(p.parent/'swf-audio-map.json').write_text(json.dumps(rows,indent=2))
print(json.dumps([r for r in rows if 'export' in r or r['parent']=='root'],indent=2))
print('STARTS',json.dumps([r for r in rows if 'startSound'in r][:45]))
