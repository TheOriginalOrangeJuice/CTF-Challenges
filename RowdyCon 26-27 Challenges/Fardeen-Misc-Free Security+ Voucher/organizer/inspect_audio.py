from pathlib import Path
import subprocess,json
root=Path(__file__).resolve().parent/'original-source'/'extracted-sounds'
rows=[]
for p in sorted(root.glob('*.mp3')):
 r=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(p)],capture_output=True,text=True)
 if r.returncode==0:
  d=float(json.loads(r.stdout)['format']['duration']);rows.append({'file':p.name,'seconds':d});print(p.name,round(d,3))
(root.parent/'audio-durations.json').write_text(json.dumps(rows,indent=2))
