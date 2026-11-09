"""Recover artwork using only downloaded original pixels and edge continuity."""
import itertools, json, pathlib, sys
import numpy as np
from PIL import Image
out=pathlib.Path(sys.argv[1]); crops=[]; names=[]; rects=[]
for p in sorted((out/'public/media').glob('*.png')):
    a=np.array(Image.open(p).convert('RGBA')); mask=np.any(a[:,:,:3]!=a[0,0,:3],axis=2)&(a[:,:,3]==0)
    mask[:260,:320]=False
    ys,xs=np.where(mask); rect=[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]
    c=a[rect[1]:rect[3],rect[0]:rect[2],:3];names.append(p.name);rects.append(rect);crops.append(c)
    print('RECOVERED_RECT',p.name,rect,c.shape,flush=True)
    Image.fromarray(c).save(out/(p.stem+'-fragment.png'))
assert len({c.shape for c in crops})==1
variants=[]
for c in crops:
    variants += [c,np.fliplr(c),np.flipud(c),np.flipud(np.fliplr(c))]
right=np.zeros((24,24));down=right.copy()
for i,a in enumerate(variants):
 for j,b in enumerate(variants):
    right[i,j]=np.abs(a[:,-1].astype(float)-b[:,0]).mean()
    down[i,j]=np.abs(a[-1].astype(float)-b[0]).mean()
best=[]
for perm in itertools.permutations(range(6)):
 for flips in itertools.product(range(4),repeat=6):
    v=[4*n+f for n,f in zip(perm,flips)]
    cost=right[v[0],v[1]]+right[v[1],v[2]]+right[v[3],v[4]]+right[v[4],v[5]]+down[v[0],v[3]]+down[v[1],v[4]]+down[v[2],v[5]]
    if len(best)<8 or cost<best[-1][0]:
        best.append((float(cost),v));best.sort();best=best[:8]
for rank,(cost,v) in enumerate(best):
    image=np.concatenate([np.concatenate([variants[x] for x in v[:3]],axis=1),np.concatenate([variants[x] for x in v[3:]],axis=1)],axis=0)
    Image.fromarray(image).save(out/f'assembly-{rank}.png')
    print('ASSEMBLY',rank,cost,[(names[x//4],x%4) for x in v],flush=True)
(out/'independent-solve.json').write_text(json.dumps({'rectangles':dict(zip(names,rects)),'ranked':best,'orientation_index':'0 none, 1 mirrorX, 2 mirrorY, 3 both'},indent=2))
