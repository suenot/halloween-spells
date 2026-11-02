"""Download picked reference shorts for one universe (local playback only, never committed).
Run: python3 -I references/fetch_clips.py harry-potter|naruto
Reads <universe>_candidates.json (search results) and picks_<universe>.json ({spell id: [video ids]}),
writes references/<universe>/<spell>/<id>.mp4 and references/<universe>/index.json. Needs Chrome cookies for yt-dlp."""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
universe = sys.argv[1]
OUT = ROOT / universe
cand_file = ROOT / ("hp_candidates.json" if universe == "harry-potter" else f"{universe}_candidates.json")
CAND = {c["id"]: c for v in json.load(open(cand_file)).values() for c in v["candidates"]}
CAND.update(json.load(open(ROOT / "extra_candidates.json")))  # hand-added clips not in a search result
PICKS = json.load(open(ROOT / f"picks_{universe}.json"))
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
