import { h } from "./dom.js";
import { audio } from "../engine/audio.js";

export function mountSoundbar(host) {
  const mute = h("button", { class: "sb-btn", title: "Звук вкл/выкл", "aria-label": "Звук", onclick: () => audio.setMuted(!audio.prefs().muted) });
  const music = h("button", { class: "sb-btn", title: "Музыка вкл/выкл", "aria-label": "Музыка", onclick: () => audio.setMusic(!audio.prefs().music) });
  const vol = h("input", { class: "sb-vol", type: "range", min: "0", max: "1", step: "0.05", "aria-label": "Громкость", oninput: (e) => audio.setVolume(+e.target.value) });
  const paint = (p) => {
    mute.textContent = p.muted ? "🔇" : "🔊";
    music.textContent = p.music ? "🎵" : "🎶";
    music.classList.toggle("off", !p.music);
    vol.value = p.volume; vol.disabled = p.muted;
  };
  paint(audio.prefs());
  audio.onChange(paint);
  host.append(mute, music, vol);
}
