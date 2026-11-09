"""Record a candidate manifest without misrepresenting blocked solve qualification."""
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

root = Path(__file__).resolve().parents[1]
flag = next(line.partition("=")[2] for line in (root / "organizer/event.env").read_text().splitlines() if line.startswith("FLAG="))
source = (root / "Description.md").read_text()
assert re.findall(r"^## (.+)$", source, re.M) == ["Description", "Files", "Hint(s)", "Walkthrough", "Flag"]
assert re.search(r"## Hint\(s\)\s+None\s+## Walkthrough", source)
assert source.split("## Flag\n", 1)[1].strip() == f"`{flag}`"
assert "Release blocker:" in source

with zipfile.ZipFile(root / "Description.docx") as archive:
    xml = ET.fromstring(archive.read("word/document.xml"))
    paragraphs = ["".join(p.itertext()) for p in xml.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p")]
assert any(flag in paragraph for paragraph in paragraphs)
assert any("Release blocker:" in paragraph for paragraph in paragraphs)

frozen = json.loads((root / "organizer/frozen-config.json").read_text())
assert all(hashlib.sha256((root / path).read_bytes()).hexdigest() == digest for path, digest in frozen["source_files"].items())
assert all(flag.encode() not in path.read_bytes() for path in (root / "challenge/public").rglob("*") if path.is_file())

capture = root / "organizer/public-ui-encoded-partial-03"
screenshots = sorted((root / "screenshots").glob("*.png"))
assert screenshots
assert all((capture / screenshot.name).is_file() and screenshot.read_bytes() == (capture / screenshot.name).read_bytes() for screenshot in screenshots)

validation = json.loads((root / "organizer/validation.json").read_text())
assert validation["solve_quality"]["status"] == "blocked"
assert validation["handoff"]["release_ready"] is False
assert json.loads((root / "organizer/handoff-check.json").read_text())["passed"] is True

files = {
    path.relative_to(root).as_posix(): {
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "bytes": path.stat().st_size,
    }
    for path in sorted(root.rglob("*"))
    if path.is_file()
    and path.relative_to(root).as_posix() != "organizer/release-manifest.json"
    and "__pycache__" not in path.parts
}
report = {
    "status": "candidate-verified-not-release-ready",
    "file_count": len(files),
    "excluded_self": "organizer/release-manifest.json",
    "checks": {
        "five_sections": True,
        "hints_none": True,
        "flag_consistent": True,
        "word_contains_flag_and_release_blocker": True,
        "current_app_matches_verified_image_source": True,
        "public_files_do_not_contain_flag": True,
        "canonical_screenshots_match_actual_final_pre_solve_capture": True,
        "safe_handoff_check_passed": True,
        "encoded_solve_qualification_blocked": True,
    },
    "release_ready": False,
    "files": files,
}
Path(sys.argv[1]).write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"candidate_verified": True, "release_ready": False, "file_count": len(files), "manifest": sys.argv[1]}))
