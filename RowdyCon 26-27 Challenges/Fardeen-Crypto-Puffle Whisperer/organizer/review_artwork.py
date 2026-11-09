from pathlib import Path
import json
import sys
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

root, out = map(Path, sys.argv[1:3])
out.mkdir(exist_ok=True, parents=True)
groups = {"rooms": ["igloo", "landscape"], "furniture": [p.name for p in root.glob("furniture-*")],
    "puffles": ["puffle-purple", "card-purple", "card-blue", "card-red"], "penguin": ["penguin"], "interface": ["interface"]}
for group, names in groups.items():
    files = []
    for name in names:
        for file in sorted((root / name).rglob("*.png")):
            im = Image.open(file).convert("RGBA")
            if im.getbbox(): files.append(file)
    for batch in range(0, len(files), 80):
        subset = files[batch:batch+80]
        sheet = Image.new("RGB", (1200, ((len(subset)+5)//6)*145), "#dce8ed")
        d = ImageDraw.Draw(sheet)
        for index, file in enumerate(subset):
            im = Image.open(file).convert("RGBA")
            im = im.crop(im.getbbox())
            im.thumbnail((184,110))
            x,y = (index%6)*200, (index//6)*145
            sheet.paste(im,(x+(200-im.width)//2,y),im)
            d.text((x+4,y+112),str(file.relative_to(root)).replace("DefineSprite_", "S").replace("DefineButton2_", "B")[:48],fill="black")
        sheet.save(out/f"{group}-{batch//80}.png")
    print(group, len(files), flush=True)

symbols={}
for name in ["penguin", "puffle-purple", "interface", "igloo", "landscape"]:
    r=ET.parse(root/name/"source.xml")
    symbols[name]=[ET.tostring(e,encoding="unicode") for e in r.iter() if e.get("type")=="ExportAssetsTag"]
(out/"symbols.json").write_text(json.dumps(symbols,indent=2))
