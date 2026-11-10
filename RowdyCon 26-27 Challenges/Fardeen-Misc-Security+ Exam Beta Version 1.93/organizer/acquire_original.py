"""Download original source assets; preserves provenance, does not run the SWF."""
from pathlib import Path
import urllib.request,json,hashlib,zlib,struct
ROOT=Path(__file__).resolve().parents[1];REF=ROOT/'organizer'/'references';OUT=ROOT/'challenge'/'public'/'assets';REF.mkdir(exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
urls={
 'original.swf':'https://uploads.ungrounded.net/365000/365143_Impossible_Quiz_Deluxe_NG..swf',
 'original-archive.swf':'https://archive.org/download/impossible-quiz-deluxe-newgrounds/365143_Impossible_Quiz_Deluxe_NG..swf',
 'title-sheet.png':'https://www.spriters-resource.com/resources/sheets/215/215625.png',
 'answers-sheet.png':'https://www.spriters-resource.com/resources/sheets/215/215115.png',
 'lives-sheet.png':'https://www.spriters-resource.com/resources/sheets/215/215117.png',
 'skips-sheet.png':'https://www.spriters-resource.com/resources/sheets/215/215119.png',
 'original-sounds.zip':'https://sounds.spriters-resource.com/media/assets/422/425232.zip?updated=1755544501',
 'PatrickHandSC-Regular.ttf':'https://raw.githubusercontent.com/google/fonts/main/ofl/patrickhandsc/PatrickHandSC-Regular.ttf',
 'font-OFL.txt':'https://raw.githubusercontent.com/google/fonts/main/ofl/patrickhandsc/OFL.txt',
}
records=[]
for name,url in urls.items():
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
  with urllib.request.urlopen(req,timeout=40) as r:data=r.read()
  (REF/name).write_bytes(data)
  if name.endswith('.ttf') or name=='font-OFL.txt':(OUT/name).write_bytes(data)
  records.append({'file':name,'url':url,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
  print(name,len(data),flush=True)
 except Exception as e:records.append({'file':name,'url':url,'error':str(e)});print(name,str(e),flush=True)
(REF/'original-acquisition.json').write_text(json.dumps(records,indent=2))
swf=next((REF/n for n in ['original.swf','original-archive.swf'] if (REF/n).exists()),None)
if swf:
 data=swf.read_bytes();data=data[:8]+zlib.decompress(data[8:]) if data[:3]==b'CWS' else data
 nbits=data[8]>>3;start=8+(5+4*nbits+7)//8+4
 sounds=REF/'extracted-sounds';sounds.mkdir(exist_ok=True)
 manifest=[]
 def tags(buf,start,label):
  at=start;stream=bytearray();stream_n=0
  while at+2<=len(buf):
   word=struct.unpack_from('<H',buf,at)[0];at+=2;code=word>>6;size=word&63
   if size==63:size=struct.unpack_from('<I',buf,at)[0];at+=4
   payload=buf[at:at+size];at+=size
   if code==14 and len(payload)>9:
    ident=struct.unpack_from('<H',payload)[0];fmt=payload[2]>>4
    if fmt==2:
     name=f'sound-{ident}.mp3';(sounds/name).write_bytes(payload[9:]);manifest.append({'file':name,'tag':14,'id':ident,'bytes':len(payload)-9})
   elif code in (18,45):
    if stream:(sounds/f'{label}-stream-{stream_n}.mp3').write_bytes(stream);stream_n+=1;stream=bytearray()
   elif code==19 and len(payload)>4:stream.extend(payload[4:])
   elif code==39 and len(payload)>4:tags(payload,4,f'sprite-{struct.unpack_from("<H",payload)[0]}')
   elif code==0:break
  if stream:(sounds/f'{label}-stream-{stream_n}.mp3').write_bytes(stream)
 tags(data,start,'main')
 (REF/'sound-tags.json').write_text(json.dumps(manifest,indent=2));print('Extracted',len(list(sounds.glob('*.mp3'))),'sounds')
