"""Restore off-stage sprite extents and export original composite animations."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess
import sys
import xml.etree.ElementTree as ET

source, exports, out = map(Path, sys.argv[1:4])
out.mkdir(parents=True, exist_ok=True)
java = next((source/"jre").glob("*/bin/java"))
base = [str(java), "-Xmx256m", "-Djava.awt.headless=true", "-jar", str(source/"ffdec/ffdec.jar")]
for name in ["igloo", "penguin", "puffle-purple", "puffle-blue", "puffle-red"]:
    tree=ET.parse(exports/name/"source.xml")
    root=tree.getroot()
    tags=root.find("tags")
    if name=="igloo":
        for item in list(tags):
            if item.get("type", "").startswith("PlaceObject") and item.get("name")!="background_mc":tags.remove(item)
        frames="0:1"
        sublength="1"
    else:
        rect=root.find("displayRect")
        rect.attrib.update(Xmin="-640", Xmax="640", Ymin="-1200", Ymax="400", nbits="12")
        for item in list(tags):
            if item.get("type", "").startswith("PlaceObject") and item.get("name") in ["hotspot","ring"]:tags.remove(item)
        frames="0:1-26" if name=="penguin" else "0:1-36"
        sublength="12"
    xml=out/(name+".xml")
    swf=out/(name+".swf")
    tree.write(xml, encoding="utf-8", xml_declaration=True)
    with (out/(name+".log")).open("w") as log:
        subprocess.run(base+["-xml2swf",str(xml),str(swf)],stdout=log,stderr=log,check=True)
    # FFDec's sublength export uses only the first selected main frame. Export
    # each root frame explicitly so walking, sitting and care are not omitted.
    count = 1 if name=="igloo" else 26 if name=="penguin" else min(36,int(root.get("frameCount")))
    def render(frame):
        if (out/name/str(frame)/"12.png").exists() or (name=="igloo" and (out/name/"1.png").exists()):return
        with (out/f"{name}-{frame}.log").open("w") as log:
            subprocess.run(base+["-ignorebackground","-zoom","2","-select",f"0:{frame}","-sublength",sublength,"-export","frame",str(out/name),str(swf)],stdout=log,stderr=log,check=True,timeout=180)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(render, range(1,count+1)))
    print(name,"animation exported",flush=True)
