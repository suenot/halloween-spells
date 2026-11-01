import json, subprocess, sys
SPELLS = {
 "lumos": "Lumos", "repairo": "Reparo", "aqua": "Aguamenti", "incendio": "Incendio", "glacius": "Glacius",
 "levitate": "Wingardium Leviosa", "stupefy": "Stupefy", "terra": "Defodio", "protego": "Protego",
 "expelli": "Expelliarmus", "umbra": "Obscuro", "patronus": "Expecto Patronum", "bombarda": "Bombarda",
 "everte": "Everte Statum", "reducto": "Reducto",
}
out = {}
for sid, name in SPELLS.items():
    q = f"ytsearch25:{name} spell Harry Potter shorts"
    r = subprocess.run(["yt-dlp", "--flat-playlist", "--dump-json", "--no-warnings", q], capture_output=True, text=True, timeout=180)
    items = []
    for line in r.stdout.splitlines():
        try: d = json.loads(line)
        except Exception: continue
        dur = d.get("duration") or 0
        if 3 <= dur <= 60:
            items.append({"id": d["id"], "title": d.get("title"), "channel": d.get("channel") or d.get("uploader"), "duration": dur, "views": d.get("view_count"), "url": f"https://www.youtube.com/shorts/{d['id']}"})
    out[sid] = {"spell": name, "candidates": items}
    print(sid, name, len(items), r.returncode, (r.stderr or "")[:120].replace("\n"," "), flush=True)
json.dump(out, open("hp_candidates.json", "w"), ensure_ascii=False, indent=1)
