"""Freeze the original period logo, losslessly recompressed by Wikimedia."""
from pathlib import Path
import hashlib
import json
import sys
import urllib.request
import xml.etree.ElementTree as ET

out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
url="https://upload.wikimedia.org/wikipedia/commons/3/3c/Disney_Club_Penguin_Logo.svg"
request=urllib.request.Request(url,headers={"User-Agent":"PuffleWhisperer/1.0 educational reference archive"})
with urllib.request.urlopen(request,timeout=90) as response:data=response.read()
assert hashlib.sha1(data).hexdigest()=="0bf62552b39ec0b34e422ab92e5552f613f38a73", "Logo source changed"
tree=ET.fromstring(data)
for node in tree.iter():
    assert node.tag.split("}")[-1] not in ["script","foreignObject","image"]
    for name,value in node.attrib.items():
        assert not name.lower().startswith("on")
        if name.split("}")[-1]=="href":assert value.startswith("#")
(out/"club-penguin-logo.svg").write_bytes(data)
(out/"logo-provenance.json").write_text(json.dumps({
    "file":"club-penguin-logo.svg","source":url,
    "description_page":"https://commons.wikimedia.org/wiki/File:Disney_Club_Penguin_Logo.svg",
    "source_description":"2007 Disney Club Penguin logo, extracted from the official 2008 Portuguese-launch PDF; uploaded in 2009, losslessly recompressed in 2022.",
    "rights":"Wikimedia labels this particular text logo PD-textlogo and notes trademark restrictions. This does not apply to the other Disney artwork.",
    "bytes":len(data),"sha256":hashlib.sha256(data).hexdigest(),"transforms":"None; original vector paths retained. SVG checked for active and externally referenced content."
},indent=2)+"\n")
print("Verified original logo",len(data),hashlib.sha256(data).hexdigest())
