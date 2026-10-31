const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
export const speechSupported = () => Boolean(SR);

// Calls onText(transcript, isFinal) for every alternative. Returns null when unsupported.
export function listen(onText, { lang = "ru-RU", onError } = {}) {
  if (!SR) return null;
  const rec = new SR();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 3;
  let on = true;
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      for (let a = 0; a < e.results[i].length; a++) onText(e.results[i][a].transcript, e.results[i].isFinal);
    }
  };
  rec.onend = () => { if (on) { try { rec.start(); } catch { /* already started */ } } };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "network") { on = false; onError?.(e.error); }
  };
  try { rec.start(); } catch (e) { onError?.(String(e)); return null; }
  return { stop() { on = false; try { rec.stop(); } catch { /* noop */ } } };
}
