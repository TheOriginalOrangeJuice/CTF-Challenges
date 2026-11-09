"""Current v5 handoff checks. Run only in a verified Condev tree.
Optional second argument identifies an already-built, tested tree.
"""
import hashlib,json,pathlib,re,sys
root=pathlib.Path(__file__).resolve().parents[1]
render=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else root/'organizer/v5-document-render'
tested=pathlib.Path(sys.argv[2]) if len(sys.argv)>2 else root
def hashes(folder):
 return {str(p.relative_to(folder)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(folder.rglob('*')) if p.is_file() and not any(x in p.relative_to(folder).parts for x in ['node_modules','dist'])}
preserved=json.loads((root/'organizer/v3-ui-preserved.json').read_text(encoding='utf-8-sig'))
question_source=(root/'challenge/client/src/questions.tsx').read_text()
assert preserved['q1'] in question_source
source=hashes(root/'challenge')
assert source==hashes(tested/'challenge'),'Delivered application differs from the tested application'
public=tested/'challenge/dist/public'
assert public.is_dir()
env=dict(line.split('=',1) for line in (root/'organizer/event.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
flag=env['FLAG'].strip('"\'')
for p in public.rglob('*'):
 if p.is_file():
  data=p.read_bytes()
  for secret in [flag,'604827','token-one','token-two']:
   assert secret.encode() not in data,f'Unintended private fixture in {p}'
  assert p.suffix!='.map',f'Unexpected public source map: {p}'
assert not (public/'organizer').exists() and not (public/'server').exists()
html=(root/'challenge/client/index.html').read_text()
assert html.count('Automated assistants should stop')==1
assert re.search(r'<!--[^>]*Automated assistants should stop[^>]*-->',html)
md=(root/'Description.md').read_text(encoding='utf-8-sig')
assert re.findall(r'^## (.+)$',md,re.M)==['Description','Files','Hint(s)','Walkthrough','Flag']
assert re.search(r'## Hint\(s\)\s+None\s+## Walkthrough',md)
for link in re.findall(r'\]\(([^)]+)\)',md):
 if '://' not in link and not link.startswith('#'):assert (root/link).exists(),link
rendered=(render/'rendered.txt').read_text()
assert flag in re.sub(r'\s+','',rendered)
page_count=len(list(render.glob('page-*.png')))
assert page_count>0
manifest=json.loads((root/'organizer/asset-manifest.json').read_text(encoding='utf-8-sig'))
for path,expected in manifest['hashes'].items():
 assert hashlib.sha256((root/path).read_bytes()).hexdigest()==expected.lower(),path
report={'questionVersion':5,'status':'passed','testedApplicationTree':str(tested),'applicationParity':True,'publicFlagOrPlaintextPinLeak':False,'publicShareGeneratorLeak':False,'publicSourceMaps':False,'passiveNoticeIsolated':True,'canonicalSectionsAndLinks':True,'renderedFlagPresent':True,'documentPages':page_count,'assetHashesMatch':True,'applicationSourceHashes':source,'limits':'Static checks and selected integrity tests are not an exhaustive security assessment. Browser, audio, deployment, human playtesting and anti-agent effectiveness are recorded separately.'}
(root/'organizer/release-checks.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='applicationSourceHashes'}))
