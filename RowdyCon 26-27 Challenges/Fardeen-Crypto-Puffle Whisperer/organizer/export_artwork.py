"""Export original SWF timelines without executing their ActionScript."""
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

root, out = map(Path, sys.argv[1:3])
out.mkdir(parents=True, exist_ok=True)
java = next((root / "jre").glob("*/bin/java"))
base = [str(java), "-Xmx256m", "-Djava.awt.headless=true", "-jar", str(root / "ffdec/ffdec.jar")]
for source in sorted(root.glob("*.swf")):
    dest = out / source.stem
    if (dest / ".done").exists():
        continue
    dest.mkdir(exist_ok=True)
    subprocess.run(base + ["-swf2xml", str(source), str(dest / "source.xml")], stdout=subprocess.DEVNULL, check=True, timeout=120)
    ids = [e.get("spriteId") for e in ET.parse(dest / "source.xml").iter() if e.get("type") == "DefineSpriteTag"]
    selection = ",".join(f"{i}:1" for i in ["0"] + ids)
    with (dest / "export.log").open("w") as log:
        subprocess.run(base + ["-ignorebackground", "-zoom", "2", "-select", selection, "-export", "frame,sprite,button,sound", str(dest), str(source)], stdout=log, stderr=log, check=True, timeout=180)
    if "crumbs" in source.stem:
        subprocess.run(base + ["-export", "script", str(dest), str(source)], stdout=subprocess.DEVNULL, check=True, timeout=120)
    (dest / ".done").touch()
    print(source.name, "exported", flush=True)
