"""Organizer contract and complete-route checks; not independent public playtesting."""
import urllib.request,urllib.error,http.cookiejar,json,uuid,pathlib,sys
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:18115'
OUT=pathlib.Path(sys.argv[2]) if len(sys.argv)>2 else pathlib.Path('/tmp/iq-api-results.json')
class Exam:
 def __init__(self):self.http=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.state=None
 def request(self,path,data=None,expected=200):
  req=urllib.request.Request(BASE+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json','Origin':BASE})
  try:
   with self.http.open(req) as r:code=r.status;result=json.load(r)
  except urllib.error.HTTPError as e:code=e.code;result=json.load(e)
  assert code==expected,(path,code,result)
  if 'state'in result:self.state=result['state']
  return result
 def start(self):return self.request('/api/session',{})
 def act(self,kind,expected=200,**extra):
  payload={'attempt':self.state['attempt'],'revision':self.state['revision'],'requestId':str(uuid.uuid4()),'kind':kind,**extra}
  return self.request('/api/action',payload,expected),payload
answers={1:{'target':'unboxed'},2:{'patched':True},3:{'width':9},4:{'cards':['key','wingprint']},5:{'box':{'x':.1,'y':.1,'w':.3,'h':.8}},6:{'cuts':['B-V','A-V']},7:{'permissions':['READ']},8:{'bag':2},9:{'position':0,'direction':-1},10:{'subjects':['Moth','Goose']},11:{'actions':['OPEN_OUTER','GOOSE_IN','CLOSE_OUTER','OPEN_INNER','GOOSE_OUT','CLOSE_INNER']},12:{'order':['BACKUP','ISSUE','APPROVE','EXPIRE']},13:{'shiftMs':-200,'invert':True},14:{'strip':'ABCD'},15:{'truths':[True,True,False,False]},16:{'actions':['ISOLATE','REMOVE','DRAIN','CUT']},17:{'scope':'ALL'},18:{'operations':['F','F','F','S','R_INV']},19:{'labels':['R','S','F']},20:{'rejected':[6,4,5],'order':[1,2,3],'badge':3}}
checks=[]
a=Exam();a.start();a.request('/api/reward',expected=403)
a.act('notes',notes='Keep this across game over.')
response,payload=a.act('submit',draft={'target':'option0'});assert a.state['lives']==2
a.request('/api/action',payload);assert a.state['lives']==2;checks.append('duplicate request does not spend another life')
a.act('draft',draft={'target':'unboxed'});a.request('/api/action',{**payload,'requestId':str(uuid.uuid4())},409);assert a.state['lives']==2
a.act('submit',draft={'target':'option1'});a.act('submit',draft={'target':'option2'});assert a.state['status']=='gameover'
a.act('restart');assert a.state['q']==1 and a.state['lives']==3 and a.state['notes']=='Keep this across game over.' and a.state['skips']==0;checks.append('three lives, full restart, retained notes')
a.act('draft',expected=400,draft={'target':'unboxed','correct':True});assert a.state['lives']==3;checks.append('malformed draft has no life penalty')
for q in range(1,21):
 assert a.state['q']==q
 if q==16:a.act('submit',expected=400,draft={'actions':[]});assert a.state['lives']==3
 r,_=a.act('submit',draft=answers[q]);assert r['event'] in ['correct','won'],(q,r)
 if q in [5,10,15]:assert a.state['skips']==q//5
assert a.state['status']=='won' and a.state['skips']==0 and len(a.state['solved'])==20
reward=a.request('/api/reward');assert reward['flag']=='RCC{certified_to_question_everything}';checks.append('all20 public API route and exact reward')
a.request('/api/state');assert a.request('/api/reward')==reward;checks.append('reward recoverable after state reload')
b=Exam();b.start();assert b.state['q']==1 and not b.state['earned'];b.request('/api/reward',expected=403);checks.append('isolated sessions')
for q in range(1,6):b.act('submit',draft=answers[q])
b.act('skip');assert b.state['q']==7 and b.state['scouting'] and b.state['skips']==0
for q in range(7,20):b.act('submit',draft=answers[q])
b.act('submit',expected=400,draft=answers[20]);b.request('/api/reward',expected=403);checks.append('scouting skip prevents certification even with correct final construction')
b.act('restart');assert b.state['q']==1 and not b.state['scouting'] and len(b.state['notebook'])==20;checks.append('scouting evidence retained but progression reset')
c=Exam();c.start()
for q in range(1,16):c.act('submit',draft=answers[q])
c.act('submit',draft={'actions':['REMOVE','ISOLATE','DRAIN','CUT']});assert c.state['status']=='gameover' and c.state['lives']==0;checks.append('declared bomb failure ends entire run')
for path in ['/organizer/event.env','/server/engine.ts','/Description.md']:a.request(path,expected=404)
a.request('/.env',expected=403)
checks.append('organizer and server sources not served')
OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps({'status':'passed','checks':checks,'kind':'organizer-authored API contract checks, not blind playtesting'},indent=2));print(json.dumps({'passed':len(checks)}))
