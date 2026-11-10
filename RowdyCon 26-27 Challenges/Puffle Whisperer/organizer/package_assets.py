"""Package reviewed, original Flash artwork as frozen PNG atlases and local MP3s."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from PIL import Image, ImageChops

source, exports, anim, out = map(Path, sys.argv[1:5])
out.mkdir(parents=True, exist_ok=True)
images = {}
def crop(path):
    im=Image.open(path).convert("RGBA")
    return im.crop(im.getbbox())
def sprite(name, number):
    matches=list((exports/name/"sprites").glob(f"DefineSprite_{number}*/1.png"))
    return next(p for p in matches if p.parent.name.split("_")[1]==str(number))
def save(name, im):
    im.save(out/(name+".png"),optimize=True)
    images[name]=name+".png"

save("landscape",Image.open(exports/"landscape/frames/1.png"))
save("igloo",Image.open(anim/"igloo/1.png"))
for name,rows in [("penguin",26),("puffle-purple",36),("puffle-blue",36),("puffle-red",36)]:
    if name.startswith("puffle"):
        rows=min(rows,int(ET.parse(exports/name/"source.xml").getroot().get("frameCount")))
    atlas=Image.new("RGBA",(128*12,160*rows))
    for row in range(1,rows+1):
        for frame in range(1,13):
            file=anim/name/str(row)/(str(frame)+".png")
            if not file.exists(): raise RuntimeError(f"Missing real animation frame: {file}")
            im=Image.open(file).convert("RGBA")
            assert im.size==(128,160)
            atlas.alpha_composite(im,((frame-1)*128,(row-1)*160))
    if name=="penguin":
        colors={"blue":(51,102,204),"red":(216,38,49),"green":(36,166,66),"purple":(133,55,175),"orange":(237,140,22),"pink":(245,108,174)}
        r,g,b,a=atlas.split()
        mask=ImageChops.multiply(ImageChops.subtract(b,r).point(lambda v:255 if v>25 else 0),ImageChops.subtract(b,g).point(lambda v:255 if v>25 else 0))
        for color,rgb in colors.items():
            tinted=Image.merge("RGBA",tuple(b.point(lambda v,c=c:min(255,round(v*c/153))) for c in rgb)+(a,))
            save("penguin-"+color,Image.composite(tinted,atlas,mask))
    else:save(name,atlas)

for color,num in [("purple",4),("blue",5),("red",5)]:save("card-"+color,crop(sprite("card-"+color,num)))
save("player-card",crop(sprite("interface",184)))
portrait=crop(sprite("interface",184))
r,g,b,a=portrait.split()
mask=ImageChops.multiply(ImageChops.subtract(b,r).point(lambda v:255 if v>25 else 0),ImageChops.subtract(b,g).point(lambda v:255 if v>25 else 0))
for color,rgb in colors.items():
    tinted=Image.merge("RGBA",tuple(b.point(lambda v,c=c:min(255,round(v*c/153))) for c in rgb)+(a,))
    save("player-card-"+color,Image.composite(tinted,portrait,mask))

java=next((source/"jre").glob("*/bin/java"))
base=[str(java),"-Xmx256m","-Djava.awt.headless=true","-jar",str(source/"ffdec/ffdec.jar")]
furniture={"sofa":(6,118),"chair":(10,58),"rug":(151,150),"plant":(162,44),"stereo":(164,65),"bed":(200,52),"bowl":(225,43),"toy":(210,38)}
furn_meta={}
for kind,(number,width) in furniture.items():
    folder=exports/f"furniture-{number}"
    original=next(folder.glob(f"sprites/*_f{number}/1.png"))
    char_id=int(original.parent.name.split("_")[1])
    dest=out.parent/"furniture-rotations"/kind
    dest.mkdir(parents=True,exist_ok=True)
    with (dest/"export.log").open("w") as log:
        subprocess.run(base+["-ignorebackground","-zoom","2","-selectid",str(char_id),"-export","sprite",str(dest),str(source/f"furniture-{number}.swf")],stdout=log,stderr=log,check=True,timeout=120)
    frames=sorted(dest.glob(f"**/DefineSprite_{char_id}*/**/*.png"),key=lambda p:int(p.stem))
    if not frames: frames=sorted(dest.rglob("*.png"),key=lambda p:int(p.stem))
    if not frames:raise RuntimeError("No furniture frames: "+kind)
    choices=[min(len(frames)-1,int(i*len(frames)/4)) for i in range(4)]
    for rotation,index in enumerate(choices):save(f"furniture-{kind}-{rotation}",crop(frames[index]))
    im=crop(frames[0]);furn_meta[kind]={"width":width,"height":width*im.height/im.width,"original_item":number,"original_frames":len(frames)}

base_button=crop(exports/"interface/buttons/DefineButton2_207/1_up.png").resize((64,64),Image.Resampling.LANCZOS)
def button(name, path):
    im=base_button.copy();icon=crop(path);icon.thumbnail((37,37),Image.Resampling.LANCZOS);im.alpha_composite(icon,((64-icon.width)//2,(64-icon.height)//2));save(name,im)
button("chat",sprite("interface",213));button("smile",sprite("interface",154));button("actions",sprite("interface",733))
button("snowball",sprite("igloo",4));button("send",sprite("interface",240));button("player-icon",sprite("interface",184));button("pets",out/"card-blue.png")
save("home",crop(sprite("interface",603)));save("settings",crop(sprite("interface",607)))
save("news",crop(exports/"interface/buttons/DefineButton2_327/1_up.png"));save("mail",crop(exports/"interface/buttons/DefineButton2_315/1_up.png"))
save("edit",crop(sprite("interface",345)))

for n in [1,2]:
    clips=sorted((exports/f"music-{n}/sounds").glob("*.mp3"),key=lambda p:int(p.name.split("_")[0]))
    # Flash stores separate MP3 streams, each with timestamps starting at zero.
    # Decode before concatenation to avoid overlapping MP3 timestamps.
    decoded=out.parent/f"music-{n}-decoded"
    decoded.mkdir(parents=True,exist_ok=True)
    wavs=[]
    for i,clip in enumerate(clips):
        wav=decoded/f"{i}.wav"
        subprocess.run(["ffmpeg","-v","error","-y","-i",str(clip),"-ar","44100","-ac","2","-codec:a","pcm_s16le",str(wav)],check=True)
        wavs.append(wav)
    listing=out.parent/f"music-{n}-concat.txt"
    listing.write_text("\n".join("file '"+str(p)+"'" for p in wavs)+"\n")
    subprocess.run(["ffmpeg","-v","error","-y","-f","concat","-safe","0","-i",str(listing),"-codec:a","libmp3lame","-b:a","128k","-map_metadata","-1",str(out/f"music-{n}.mp3")],check=True)

(out/"manifest.json").write_text(json.dumps({"images":images,"furniture":furn_meta,"atlas":{"tile_width":128,"tile_height":160,"frames":12}},indent=2)+"\n")
provenance={"source_revision":"b3a86b70689a38fdf8773c250aa576551acb65b8","sources":json.loads((source/"sources.json").read_text()),
    "tools":json.loads((source/"extraction-tools.json").read_text()),
    "transforms":["Original SWF vector/sprite/animation exports via FFDec; ActionScript not executed.","Removed non-rendered authoring guides from igloo; expanded avatar render bounds.","Original penguin body recolored for six player-selected colors; original faces, shading and animation retained.","Original interface artwork composed on its original round button.","Original numbered music clips decoded and concatenated in numeric order, encoded to local 128kbps MP3."],
    "limitations":["Decorating offers eight items and up to four source orientations; items with only one source orientation cannot rotate.","Only the opening twelve subframes of each selected animation are retained; movement and additional reactions are authored in Canvas.","HTML dialogs and procedural interaction cues are reconstructed. The room, characters, furniture and interface icons use original archived artwork. The original period wordmark is recorded separately in logo-provenance.json.","Archive access is not an open license to Disney artwork. Retain the in-app attribution; no claim of public-domain artwork."],
    "files":[{"path":p.name,"bytes":p.stat().st_size,"sha256":hashlib.file_digest(p.open("rb"),"sha256").hexdigest()} for p in sorted(out.iterdir()) if p.is_file()]}
(out.parent/"asset-provenance.json").write_text(json.dumps(provenance,indent=2)+"\n")
print("Packaged",len(provenance["files"]),"frozen assets",json.dumps(furn_meta),flush=True)
