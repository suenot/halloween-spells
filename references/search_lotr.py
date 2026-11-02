import json, subprocess
SPELLS = {
 "starlight": "Galadriel Phial of Galadriel light Frodo", "earendil": "Light of Earendil phial Shelob Sam", "entwake": "Ents march Isengard Treebeard",
 "eagles": "Gandalf eagles arrive Black Gate", "youshall": "Gandalf You shall not pass Balrog", "mountfire": "Mount Doom lava Frodo Gollum",
}
out = {}
for sid, name in SPELLS.items():
    r = subprocess.run(["yt-dlp", "--flat-playlist", "--dump-json", "--no-warnings", f"ytsearch25:{name} Lord of the Rings shorts"], capture_output=True, text=True, timeout=180)
    items = []
    for line in r.stdout.splitlines():
        try: d = json.loads(line)
        except Exception: continue
        dur = d.get("duration") or 0
        if 3 <= dur <= 60:
            items.append({"id": d["id"], "title": d.get("title"), "channel": d.get("channel") or d.get("uploader"), "duration": dur, "views": d.get("view_count"), "url": f"https://www.youtube.com/shorts/{d['id']}"})
    items.sort(key=lambda c: -(c["views"] or 0))
    out[sid] = {"spell": name, "candidates": items}
json.dump(out, open("lotr_candidates.json", "w"), ensure_ascii=False, indent=1)
for sid, v in out.items():
    print("==", sid, v["spell"])
    for c in v["candidates"][:7]:
        print("  ", c["id"], c["duration"], c["views"], (c["channel"] or "")[:16], "|", c["title"][:58])
