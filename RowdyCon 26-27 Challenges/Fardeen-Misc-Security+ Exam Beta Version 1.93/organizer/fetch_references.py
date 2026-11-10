"""Acquire frozen original-game reference material. Run only inside Condev."""
from pathlib import Path
import urllib.request,re,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'organizer'/'references'
OUT.mkdir(parents=True,exist_ok=True)
URLS={
 'newgrounds':'https://www.newgrounds.com/portal/view/365143',
 'title':'https://www.spriters-resource.com/browser_games/theimpossiblequiz/asset/215625/',
 'answers':'https://www.spriters-resource.com/browser_games/theimpossiblequiz/asset/215115/',
 'lives':'https://www.spriters-resource.com/browser_games/theimpossiblequiz/asset/215117/',
 'skips':'https://www.spriters-resource.com/browser_games/theimpossiblequiz/asset/215119/',
 'sounds':'https://sounds.spriters-resource.com/browser_games/theimpossiblequiz/asset/425232/',
 'menu-capture':'https://cdn.mobygames.com/92010d5c-ac08-11ed-83c1-02420a000131.webp',
 'gameover-capture':'https://cdn.mobygames.com/screenshots/12288524-the-impossible-quiz-browser-i-guessed-too-many-questions-wrong-g.png',
}
records=[]
for name,url in URLS.items():
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
  with urllib.request.urlopen(req,timeout=30) as r: data=r.read();typ=r.headers.get('Content-Type','')
  ext='.html' if 'html' in typ else '.webp' if 'webp' in typ else '.png'
  (OUT/(name+ext)).write_bytes(data)
  records.append({'name':name,'url':url,'sha256':hashlib.sha256(data).hexdigest(),'type':typ})
  if ext=='.html':
   s=data.decode('utf-8','replace').replace('\\/','/')
   links=sorted(set(re.findall(r'https?[^\s"<>]+\.(?:png|zip|swf|webp)(?:\?[^\s"<>]*)?',s)))
   links += re.findall(r'href="([^\"]*(?:download|asset)[^\"]*)"',s)
   print(name,json.dumps(links[-35:]))
  else:print(name,len(data))
 except Exception as e:records.append({'name':name,'url':url,'error':str(e)});print(name,str(e))
(OUT/'acquisition.json').write_text(json.dumps(records,indent=2))
