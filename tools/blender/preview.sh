#!/bin/sh
# usage: tools/blender/preview.sh  -> build/preview.png contact sheet of key frames
B=/Applications/Blender.app/Contents/MacOS/Blender
cd "$(dirname "$0")/../.."
for spec in peace:30 open_hands:30 prayer:34 fist_palm:40 double_fist:30 fist_up:30; do
  c=${spec%%:*}; f=${spec##*:}
  $B -b --python tools/blender/hands.py -- --clip $c --out build/gestures --frame $f --size 360 >/dev/null 2>&1
done
python3 - <<'PY'
from PIL import Image
specs=[("peace",30),("open_hands",30),("prayer",34),("fist_palm",40),("double_fist",30),("fist_up",30)]
sheet=Image.new("RGBA",(360*3,360*2),(30,16,60,255))
for i,(c,f) in enumerate(specs):
    im=Image.open(f"build/gestures/{c}/{f:03d}.png").convert("RGBA")
    sheet.alpha_composite(im,((i%3)*360,(i//3)*360))
sheet.save("build/preview.png")
PY
