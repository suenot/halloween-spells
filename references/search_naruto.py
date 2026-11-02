import json, subprocess
SPELLS = {
 "kai": "Kai release genjutsu", "kawarimi": "Kawarimi substitution jutsu", "setsuna": "Naruto Rasenshuriken Sage Mode", "futon": "Futon Daitoppa wind release",
 "kage": "Shadow clone jutsu Kage Bunshin", "katon": "Katon Goukakyuu fireball jutsu", "doton": "Doton Doryuheki earth wall", "hyoton": "Haku Demonic Ice Mirrors",
 "suiton": "Suiton Water Dragon jutsu", "inton": "Hidden Mist jutsu Kirigakure", "raiton": "Chidori Kakashi", "ryuka": "Katon Ryuka no Jutsu dragon fire",
 "rasengan": "Rasengan", "raikiri": "Raikiri Kakashi", "bunshin": "Naruto Multi Shadow Clone Jutsu",
}
out = {}
for sid, name in SPELLS.items():
    r = subprocess.run(["yt-dlp", "--flat-playlist", "--dump-json", "--no-warnings", f"ytsearch25:{name} Naruto shorts"], capture_output=True, text=True, timeout=180)
    items = []
    for line in r.stdout.splitlines():
        try: d = json.loads(line)
        except Exception: continue
        dur = d.get("duration") or 0
        if 3 <= dur <= 60:
            items.append({"id": d["id"], "title": d.get("title"), "channel": d.get("channel") or d.get("uploader"), "duration": dur, "views": d.get("view_count"), "url": f"https://www.youtube.com/shorts/{d['id']}"})
    items.sort(key=lambda c: -(c["views"] or 0))
    out[sid] = {"spell": name, "candidates": items}
    print(sid, len(items), flush=True)
json.dump(out, open("naruto_candidates.json", "w"), ensure_ascii=False, indent=1)
