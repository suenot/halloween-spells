#!/bin/sh
# Renders every gesture clip with Blender and encodes transparent VP9 webm into public/assets/gestures/.
# usage: tools/blender/build_gestures.sh [clip ...]   (default: all)
B=/Applications/Blender.app/Contents/MacOS/Blender
cd "$(dirname "$0")/../.."
CLIPS=${*:-"peace open_hands prayer fist_palm double_fist fist_up w_circle w_swipe_right w_swipe_left w_up w_down w_zigzag"}
mkdir -p public/assets/gestures build/gestures
for c in $CLIPS; do
  ( rm -rf build/gestures/$c; $B -b --python tools/blender/hands.py -- --clip $c --out build/gestures --size 420 >build/$c.log 2>&1 \
    && ffmpeg -y -loglevel error -framerate 24 -i build/gestures/$c/%03d.png -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 33 -auto-alt-ref 0 public/assets/gestures/$c.webm \
    && { [ -f build/gestures/$c.json ] && cp build/gestures/$c.json public/assets/gestures/$c.json; echo "ok $c"; } ) &
done
wait
