#!/usr/bin/env bash
# Downloads the in-browser speech recognition runtimes and models into public/vendor/asr.
# Usage: scripts/fetch-asr.sh [all|runtime|sherpa|heavy|vosk|whisper]   (default: all)
# "runtime" fetches only the WASM runtimes (for hosting: the models then load from Hugging Face).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$PWD/public/vendor/asr"
HF=https://huggingface.co
mkdir -p "$OUT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
what="${1:-all}"

get() { # url dest  (resumable; fails loudly)
  [ -s "$2" ] && { echo "have $2"; return 0; }
  mkdir -p "$(dirname "$2")"
  local try
  for try in 1 2 3 4 5; do
    if curl -fSL --http1.1 -C - -o "$2.part" "$1"; then mv "$2.part" "$2"; echo "got  $2"; return 0; fi
    echo "retry $try for $2" >&2
  done
  echo "FAILED $2" >&2
  return 1
}

sherpa_runtime() {
  (cd "$TMP" && npm pack sherpa-onnx@2.0.1 --silent >/dev/null && mkdir -p sh && tar xzf sherpa-onnx-*.tgz -C sh)
  mkdir -p "$OUT/sherpa"
  cp "$TMP"/sh/package/sherpa-onnx-wasm-nodejs.{js,wasm} "$TMP"/sh/package/sherpa-onnx-asr.js "$OUT/sherpa/"
}

sherpa_model() { # repo dir files...
  local repo="$1" dir="$2"; shift 2
  for f in "$@"; do get "$HF/$repo/resolve/main/$f" "$OUT/models/$dir/$f"; done
}

whisper_runtime() {
  (cd "$TMP" && npm pack @huggingface/transformers@4.3.2 --silent >/dev/null && mkdir -p tf && tar xzf huggingface-transformers-*.tgz -C tf)
  mkdir -p "$OUT/transformers"
  cp "$TMP"/tf/package/dist/transformers.js "$OUT/transformers/"
  # transformers.js loads the ONNX Runtime WASM from the folder named in wasmPaths; the npm dist only has the glue.
  (cd "$TMP" && npm pack onnxruntime-web@1.31.0-dev.20260914-8d85527a0 --silent >/dev/null && mkdir -p ort && tar xzf onnxruntime-web-*.tgz -C ort)
  cp "$TMP"/ort/package/dist/ort-wasm-simd-threaded.asyncify.{mjs,wasm} "$OUT/transformers/"
}

if [[ "$what" == runtime ]]; then
  sherpa_runtime
  whisper_runtime
fi

if [[ "$what" == all || "$what" == sherpa ]]; then
  sherpa_runtime
  sherpa_model csukuangfj/sherpa-onnx-streaming-zipformer-small-ru-vosk-int8-2025-08-16 zipformer-ru-small \
    encoder.int8.onnx decoder.onnx joiner.int8.onnx tokens.txt
  sherpa_model csukuangfj/sherpa-onnx-streaming-t-one-russian-2025-09-08 t-one-ru model.onnx tokens.txt
fi

if [[ "$what" == all || "$what" == heavy ]]; then
  [ -d "$OUT/sherpa" ] || sherpa_runtime
  sherpa_model csukuangfj/sherpa-onnx-nemo-ctc-giga-am-v3-russian-2025-12-16 gigaam-v3-ctc model.int8.onnx tokens.txt
fi

if [[ "$what" == all || "$what" == vosk ]]; then
  (cd "$TMP" && npm pack vosk-browser@0.0.8 --silent >/dev/null && mkdir -p vb && tar xzf vosk-browser-*.tgz -C vb)
  mkdir -p "$OUT/vosk"
  cp "$TMP"/vb/package/dist/vosk.js "$OUT/vosk/"
  if [ ! -s "$OUT/vosk/vosk-model-small-ru-0.22.tar.gz" ]; then
    get https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip "$TMP/vosk.zip"
    (cd "$TMP" && unzip -q vosk.zip && tar czf "$OUT/vosk/vosk-model-small-ru-0.22.tar.gz.part" vosk-model-small-ru-0.22)
    mv "$OUT/vosk/vosk-model-small-ru-0.22.tar.gz.part" "$OUT/vosk/vosk-model-small-ru-0.22.tar.gz"
  fi
fi

if [[ "$what" == all || "$what" == whisper ]]; then
  whisper_runtime
  W=Xenova/whisper-tiny
  for f in config.json generation_config.json preprocessor_config.json tokenizer.json tokenizer_config.json \
           onnx/encoder_model_quantized.onnx onnx/decoder_model_merged_quantized.onnx \
           added_tokens.json merges.txt normalizer.json special_tokens_map.json vocab.json; do
    get "$HF/$W/resolve/main/$f" "$OUT/models/$W/$f"
  done
fi
echo ok
