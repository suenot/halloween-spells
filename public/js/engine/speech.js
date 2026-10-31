import { settings } from "../store.js";
import { DEFAULT_ENGINES, engineDef, startListening, warmup } from "./asr/engines.js";

const chosen = () => {
  const ids = (settings().asr ?? DEFAULT_ENGINES).filter((id) => engineDef(id));
  return ids.length ? ids : DEFAULT_ENGINES;
};

// Local engines only need a microphone; Web Speech needs Chrome.
export const speechSupported = () => chosen().some((id) => id !== "webspeech" || Boolean(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition));

/** Loads the chosen models while the camera starts, so the first spell is not delayed. */
export const prepareSpeech = (onStatus) => warmup(chosen(), onStatus);

/** onText(transcript, isFinal, engineId) for every hypothesis of every chosen engine. Returns {stop()}. */
export function listen(onText, { onError, onStatus } = {}) {
  return startListening(chosen(), onText, { onError, onStatus });
}
