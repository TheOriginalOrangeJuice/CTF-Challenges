"""Deterministic authoring; execute only in verified Condev staging."""
from pathlib import Path
import argparse,hashlib,json,struct,subprocess,wave,zipfile,zlib
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageOps
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'organizer'/'source';PUB=ROOT/'challenge'/'public'
FLAG='RCC{r4w_rgb_m0nt4g3_7c2e}'
SPECS=[('sample_text','sample_text.png','SAMPLE TEXT',4,(576,352),True,False),('doritos','doritos_hd.png','Doritos / crunch',0,(352,400),False,True),('dew','dew_it.png','Dew it',5,(448,320),True,False),('illuminati','illuminati_confirmed.png','Confirmed',2,(608,384),False,True),('glasses','deal_with_it.png','Deal with it',1,(384,368),False,False),('hitmarker','hitmarker.png','Hitmarker',3,(512,416),True,False)]
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def chunk(k,b):return struct.pack('>I',len(b))+k+b+struct.pack('>I',zlib.crc32(k+b)&0xffffffff)
def png_rgba(path,a):
    a=np.asarray(a,dtype=np.uint8);h,w,_=a.shape
    scan=b''.join(b'\0'+a[y].tobytes() for y in range(h))
    Path(path).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(scan,9))+chunk(b'IEND',b''))
def font(n):return ImageFont.load_default(size=n)
def fit(im):
    out=Image.new('RGBA',(240,180));im=ImageOps.contain(im.convert('RGBA'),(240,180),Image.Resampling.LANCZOS)
    out.alpha_composite(im,((240-im.width)//2,(180-im.height)//2));return out
def dew_raster():
    path=SRC/'dew-2009.png'
    if not path.exists():
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path='/usr/bin/chromium-browser',headless=True,args=['--no-sandbox'])
            page=browser.new_page(viewport={'width':300,'height':220},device_scale_factor=1)
            page.set_content('<style>html,body{margin:0;background:transparent}svg{width:300px;height:220px}</style>'+(SRC/'dew-2009.svg').read_text())
            page.screenshot(path=str(path),omit_background=True);browser.close()
    return Image.open(path)
def sprites():
    text=Image.new('RGBA',(480,300));d=ImageDraw.Draw(text)
    for word,y in [('SAMPLE',90),('TEXT',190)]:d.text((240,y),word,font=font(82),anchor='mm',fill='white',stroke_width=5,stroke_fill=(20,20,20))
    glasses=Image.new('RGBA',(240,180));d=ImageDraw.Draw(glasses)
    pattern=['111111111111111111111111111111','011111111111100111111111111110','001111111111000011111111111100','000111111110000001111111111000','000011111100000000111111110000','000001111000000000011111100000']
    for y,line in enumerate(pattern):
        for x,v in enumerate(line):
            if v=='1':d.rectangle((x*8,y*8+62,x*8+7,y*8+69),fill=(5,6,8,255))
    for x,y in [(3,1),(4,2),(5,3),(18,1),(19,2),(20,3)]:d.rectangle((x*8,y*8+62,x*8+7,y*8+69),fill='white')
    hit=Image.new('RGBA',(240,180));d=ImageDraw.Draw(hit)
    for a,b in [((75,45),(105,75)),((135,75),(165,45)),((75,135),(105,105)),((135,105),(165,135))]:d.line([a,b],fill=(0,0,0),width=15);d.line([a,b],fill='white',width=7)
    return [fit(text),fit(Image.open(SRC/'doritos.png')),fit(dew_raster()),fit(Image.open(SRC/'illuminati.png')),glasses,hit]
def endcard():
    im=Image.open(SRC/'endcard-art.png').convert('RGB').resize((1152,648),Image.Resampling.LANCZOS);d=ImageDraw.Draw(im);f=font(55)
    box=d.textbbox((0,0),FLAG,font=f,stroke_width=1);w=box[2]-box[0];h=box[3]-box[1];x=(1152-w)//2-box[0];y=324-h//2-box[1]
    d.text((x+2,y+3),FLAG,font=f,fill=(3,17,28),stroke_width=3,stroke_fill=(3,17,28));d.text((x,y),FLAG,font=f,fill=(231,255,247),stroke_width=1,stroke_fill=(69,231,188))
    im.save(ROOT/'organizer'/'endcard-master.png',compress_level=9);return im
def make_audio():
    # Freeze the decoded short excerpt once; normal regeneration never downloads
    # a song, relies on an encoder version, or replaces the recording with synthesis.
    mp3=SRC/'holdin-on-meme-source.mp3';decoded=SRC/'holdin-on-meme-source.wav'
    if sha(mp3)!='07d6bd215cd4af6571e480936b57bb7a49c151a91c0021f67c686003f85aebd5':
        raise ValueError('The frozen MONSTA meme excerpt changed.')
    if not decoded.exists():
        raw=subprocess.run(['ffmpeg','-v','error','-i',str(mp3),'-ar','22050','-ac','1','-f','s16le','pipe:1'],check=True,capture_output=True).stdout
        with wave.open(str(decoded),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(22050);w.writeframes(raw)
    if sha(decoded)!='26d9767e070c2b3e4c8126488da18bd7252399b8c715b67a9ed42ec4f1285d19':
        raise ValueError('The frozen decoded MONSTA excerpt changed; restore the recorded PCM source.')
    with wave.open(str(decoded),'rb') as w:
        if (w.getnchannels(),w.getsampwidth(),w.getframerate())!=(1,2,22050):raise ValueError('Unexpected frozen excerpt PCM format.')
        samples=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float64)
    sr=22050;t=np.arange(len(samples))/sr
    # Seven dB of attenuation; tiny onset fade and a 350ms ending fade.
    samples*=10**(-7/20)*np.minimum(t/.008,1)*np.clip((15.25-t)/.35,0,1)
    timeline=np.zeros(sr*20,dtype='<i2');timeline[:len(samples)]=np.rint(samples).astype('<i2')
    stereo=np.stack([timeline,timeline],axis=1)
    with wave.open(str(PUB/'media'/'holdin_on_mlg_excerpt.wav'),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes(stereo.tobytes())
    (PUB/'media'/'airhorns_and_bad_decisions.wav').unlink(missing_ok=True)
def make_reel():
    target=PUB/'media'/'solarium_fragcut.webm'
    if target.exists():return
    subprocess.run(['ffmpeg','-v','error','-y','-ss','42','-i',str(SRC/'xonotic-original.webm'),'-t','16','-an','-vf','scale=1152:648,fps=30','-c:v','libvpx-vp9','-b:v','800k','-crf','34','-threads','1','-row-mt','0','-fflags','+bitexact','-map_metadata','-1',str(target)],check=True)
def generate(skip_reel=False):
    (PUB/'media').mkdir(exist_ok=True);(PUB/'assets').mkdir(exist_ok=True);master=endcard();logos=sprites();srcs=[];events=[];solution=[]
    positions=[(350,222,450,280),(40,50,240,180),(840,430,240,180),(870,40,220,180),(70,450,240,180),(475,30,200,150)]
    times=[(0,3.3),(2,5.7),(5.5,8.7),(8.3,11.7),(11.2,14.2),(13.8,16)]
    for i,(sid,name,track,tile,(sx,sy),mx,my) in enumerate(SPECS):
        a=np.zeros((768,1024,4),dtype=np.uint8);a[:,:,:3]=(9,13,19);a[64:244,64:304]=np.asarray(logos[i])
        piece=master.crop(((tile%3)*384,(tile//3)*324,(tile%3+1)*384,(tile//3+1)*324))
        if mx:piece=ImageOps.mirror(piece)
        if my:piece=ImageOps.flip(piece)
        a[sy:sy+324,sx:sx+384,:3]=np.asarray(piece);a[sy:sy+324,sx:sx+384,3]=0
        path=PUB/'media'/name;png_rgba(path,a);logos[i].resize((160,120),Image.Resampling.LANCZOS).save(PUB/'assets'/(sid+'-thumb.png'),compress_level=9)
        srcs.append({'id':sid,'name':name,'trackName':track,'file':'media/'+name,'thumb':'assets/'+sid+'-thumb.png','width':1024,'height':768,'bytes':path.stat().st_size,'sha256':sha(path)})
        x,y,w,h=positions[i];base={'source':sid,'track':i,'crop':{'x':64,'y':64,'w':240,'h':180},'flipX':bool(i%2),'flipY':False,'placement':{'x':x,'y':y,'w':w,'h':h},'visible':True}
        events.extend([dict(base,id='intro-'+str(i),label=track+' / reel',start=times[i][0],end=times[i][1]),dict(base,id='end-'+str(i),label=track+' / endcard',start=16,end=20)])
        solution.append({'source':sid,'event':'end-'+str(i),'tile':tile,'crop':{'x':sx,'y':sy,'w':384,'h':324},'flipX':mx,'flipY':my,'placement':{'x':(tile%3)*384,'y':(tile//3)*324,'w':384,'h':324}})
    project={'format':'montage-recovery-v1','revision':'sample-text-1','title':'Final_Final_REAL','width':1152,'height':648,'fps':30,'duration':20,'sources':srcs,'alpha':{s['id']:'straight' for s in srcs},'events':events,'markers':[{'time':0,'label':'FRAG REEL'},{'time':16,'label':'ENDCARD — final pass'}]}
    (PUB/'media'/'Final_Final_REAL.recovery.json').write_text(json.dumps(project,indent=2)+'\n');(ROOT/'organizer'/'solution.json').write_text(json.dumps({'flag':FLAG,'events':solution},indent=2)+'\n')
    make_audio()
    if not skip_reel:make_reel()
    package()
    print(json.dumps({'generated_carriers':6,'archive_bytes':(PUB/'media'/'recovered-project.zip').stat().st_size,'master_sha256':sha(ROOT/'organizer'/'endcard-master.png')}))

def package():
    files=[PUB/'FORMAT.txt',PUB/'credits.html',PUB/'GPL-3.0.txt']+list((PUB/'assets').glob('*.png'))+[p for p in (PUB/'media').iterdir() if p.suffix in {'.png','.json','.wav','.webm'}]
    with zipfile.ZipFile(PUB/'media'/'recovered-project.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for file in sorted(files,key=lambda p:str(p.relative_to(PUB))):
            info=zipfile.ZipInfo(file.relative_to(PUB).as_posix(),date_time=(2013,7,12,16,20,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
            archive.writestr(info,file.read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
    manifest={p.relative_to(ROOT).as_posix():sha(p) for folder in [SRC,PUB/'assets',PUB/'media'] for p in sorted(folder.rglob('*')) if p.is_file()}
    (ROOT/'organizer'/'asset-hashes.json').write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n')
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--skip-reel',action='store_true');parser.add_argument('--audio-only',action='store_true');args=parser.parse_args()
    if args.audio_only:make_audio();package()
    else:generate(args.skip_reel)
