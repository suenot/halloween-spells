#!/usr/bin/env bash
# Downloads MediaPipe Tasks Vision (npm package) and the hand landmark model into public/vendor/mediapipe.
set -euo pipefail
cd "$(dirname "$0")/.."
D="$(mktemp -d)"
trap 'rm -rf "$D"' EXIT
(cd "$D" && npm pack @mediapipe/tasks-vision@1.2.0 --silent >/dev/null && tar xzf mediapipe-tasks-vision-*.tgz)
mkdir -p public/vendor/mediapipe
cp "$D"/package/vision_bundle.mjs "$D"/package/wasm/* public/vendor/mediapipe/
curl -sSL -o public/vendor/mediapipe/hand_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
echo "ok"
