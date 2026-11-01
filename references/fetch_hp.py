"""Download picked Harry Potter reference shorts (local playback only, never committed).
Run: python3 -I references/fetch_hp.py  ->  references/harry-potter/<spell>/<id>.mp4 + index.json"""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "harry-potter"
CAND = {c["id"]: c for v in json.load(open(ROOT / "hp_candidates.json")).values() for c in v["candidates"]}
CAND["8kdmqEN3674"] = {"title": "Fantastic Beast 2 - Credence Power scene", "channel": "Adjust Player Gaming", "duration": 50}
PICKS = {
    "lumos": ["cEsKCVaOsWM", "W8t9CU1kJP0"],
    "repairo": ["oIX5lTPoZJY", "Ne8YJ-Ly1VU"],
    "aqua": ["am9Na5YUNkY"],
    "incendio": ["QeYoiBmuzOM", "bxVu-CnIg60"],
    "glacius": ["sCFSh0qjJuw"],
    "levitate": ["fx2zLgdkJpk", "4xtouVRc3Ho"],
    "stupefy": ["hkigUiTFURs", "adlf9gnmAoM"],
    "protego": ["1-eBmiiCQ40", "IkYAmDe5Z3Q"],
    "expelli": ["PdrQLZnAMAs", "xwS-D1gTugk"],
    "umbra": ["8kdmqEN3674"],
    "patronus": ["PdrQLZnAMAs", "oQye2THWI7o"],
    "bombarda": ["u9zOS4tncVU", "97RkWfqpenY", "lH7kMHVeHlI"],
    "everte": ["JYxcsbnKTpA"],
    "reducto": ["9v-ucTA4kog", "xNHSOWtgdQ4"],
}
index = {}
for spell, ids in PICKS.items():
    d = OUT / spell
    d.mkdir(parents=True, exist_ok=True)
    for vid in ids:
        f = d / f"{vid}.mp4"
        if not f.exists():
            r = subprocess.run(["yt-dlp", "--cookies-from-browser", "chrome", "-q", "--no-warnings", "-f", "b[height<=480][ext=mp4]/bv*[height<=480]+ba/b[height<=480]/b",
                                "--merge-output-format", "mp4", "-o", str(f), f"https://www.youtube.com/watch?v={vid}"],
                               capture_output=True, text=True)
            if r.returncode or not f.exists():
                print("FAIL", spell, vid, r.stderr.strip()[-160:], file=sys.stderr)
                continue
        c = CAND[vid]
        index.setdefault(spell, []).append({"file": f"{spell}/{vid}.mp4", "title": c["title"], "channel": c["channel"],
                                            "duration": c["duration"], "url": f"https://www.youtube.com/watch?v={vid}"})
json.dump(index, open(OUT / "index.json", "w"), ensure_ascii=False, indent=1)
print({k: len(v) for k, v in index.items()})
