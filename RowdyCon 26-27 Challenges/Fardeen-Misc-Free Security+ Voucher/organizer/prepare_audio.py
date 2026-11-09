"""Freeze authentic SWF cues and deterministic real-sample cancellation evidence."""
from pathlib import Path
import subprocess,json,array,hashlib,shutil,math,wave
ROOT=Path(__file__).resolve().parents[1];SOURCE=ROOT/'organizer'/'original-source'/'extracted-sounds';OUT=ROOT/'challenge'/'public'/'assets'/'audio';OUT.mkdir(parents=True,exist_ok=True)
music={'title':'sound-33.mp3','quiz':'sprite-188-stream-0.mp3','win':'sprite-2897-stream-0.mp3','gameover':'sound-171.mp3'}
effects={'click':'sound-32.mp3','correct':'sound-198.mp3','wrong':'sound-157.mp3','skip':'sound-85.mp3','won':'sound-2898.mp3'}
manifest=[]
for name,src in music.items():
 dst=OUT/(name+'.mp3');shutil.copyfile(SOURCE/src,dst);manifest.append({'file':dst.name,'source':src,'role':name,'treatment':'Unmodified extracted original MP3'})
for name,src in effects.items():
 dst=OUT/(name+'.wav');subprocess.run(['ffmpeg','-v','error','-y','-i',str(SOURCE/src),'-ac','1','-ar','22050','-af','volume=0.65','-map_metadata','-1',str(dst)],check=True);manifest.append({'file':dst.name,'source':src,'role':name,'treatment':'Mono PCM22050Hz, common gain0.65, no trim'})
def decode(name):
 raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(SOURCE/name),'-ac','1','-ar','8000','-f','f32le','-'])
 return [float(x)*.25 for x in array.array('f',raw)]
n=decode(effects['wrong']);s=decode(effects['correct']);size=max(len(n),len(s));a=[(n[i] if i<len(n) else 0)+(s[i] if i<len(s) else 0) for i in range(size)];b=[0.0]*1600+n
fixture={'sampleRate':8000,'a':a,'b':b,'signal':s}
assert max(abs(x) for seq in [a,b,s] for x in seq)<1
max_error=max(abs(a[i]-(b[i+1600] if i+1600<len(b) else 0)-(s[i] if i<len(s) else 0)) for i in range(size))
assert max_error<1e-12
(OUT/'puzzle.json').write_text(json.dumps(fixture,separators=(',',':')))
manifest.append({'file':'puzzle.json','source':[effects['wrong'],effects['correct']],'role':'Actual audio cancellation evidence','treatment':'Both cues mono8000Hz with common gain0.25; A=N+S; B=1600 zero samples + full N; no truncation, clipping or normalization','peak':max(abs(x) for x in a),'correctResidualMax':max_error})
for r in manifest:r['sha256']=hashlib.sha256((OUT/r['file']).read_bytes()).hexdigest();r['bytes']=(OUT/r['file']).stat().st_size
(ROOT/'organizer'/'audio-manifest.json').write_text(json.dumps({'source':'https://uploads.ungrounded.net/365000/365143_Impossible_Quiz_Deluxe_NG..swf','originalSha256':hashlib.sha256((SOURCE.parent/'original.swf').read_bytes()).hexdigest(),'mappingEvidence':'Root frame2 sound33; root question frames repeatedly sound198; lives sprite174 sound157 and gameover171; quiz stream188; completion stream2897. Mapping from SWF structure, not independent human listening.','reuseStatus':'Copyright retained by original creators. Public availability and third-party archive CC0 metadata do not establish a license for third-party music. Event organizer must retain appropriate reuse authorization.','assets':manifest},indent=2))
print(json.dumps({'assets':len(manifest),'samples':size,'maxResidual':max_error,'originalAudio':True}))
