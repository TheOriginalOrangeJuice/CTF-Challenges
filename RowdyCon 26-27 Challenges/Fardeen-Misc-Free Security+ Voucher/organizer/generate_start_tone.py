"""Author a quiet, neutral exam-start cue. Run in a verified Condev tree."""
import hashlib,json,math,pathlib,struct,wave
root=pathlib.Path(__file__).resolve().parents[1]
rate=48000
samples=[]
for i in range(round(rate*.48)):
 t=i/rate
 value=0.0
 for start,freq,duration,gain in [(0,440,.24,.18),(.16,660,.30,.15)]:
  u=t-start
  if 0<=u<duration:
   attack=min(1,u/.012)
   decay=math.exp(-u*11)
   release=min(1,(duration-u)/.04)
   value+=gain*attack*decay*release*(math.sin(2*math.pi*freq*u)+.15*math.sin(4*math.pi*freq*u))
 samples.append(value)
path=root/'challenge/public/assets/audio/start.wav'
with wave.open(str(path),'wb') as out:
 out.setnchannels(1);out.setsampwidth(2);out.setframerate(rate)
 out.writeframes(b''.join(struct.pack('<h',round(x*32767)) for x in samples))
record={'asset':'challenge/public/assets/audio/start.wav','source':'First-party synthesis using generate_start_tone.py','purpose':'User-requested mature replacement for the original start click effect','treatment':'Two soft sine tones,440Hz then660Hz, short attack and exponential decay; no speech or comedic sample','reuse':'First-party authored waveform; no third-party recording sampled','sampleRate':rate,'durationSeconds':len(samples)/rate,'peak':max(map(abs,samples)),'rms':math.sqrt(sum(x*x for x in samples)/len(samples)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
(root/'organizer/start-tone.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record))
