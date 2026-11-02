// Local reference clips (films/anime) for a spell, played from downloaded files, never from YouTube.
// The files are private and gitignored (references/<universe>/, served at /refs/<universe>/ by server.mjs only);
// on a build without them the index is missing and no element is shown.
import { h } from "./dom.js";

export const UNIVERSES = ["harry-potter", "naruto"];
let index = null;

// One merged index: spell id -> clips, each with the URL of its file. Spell ids are unique across universes.
function loadIndex() {
  index ??= Promise.all(UNIVERSES.map((u) => fetch(`/refs/${u}/index.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    .then((idx) => Object.entries(idx).map(([id, clips]) => [id, clips.map((c) => ({ ...c, src: `/refs/${u}/${c.file}` }))]))))
    .then((parts) => Object.fromEntries(parts.flat()));
  return index;
}

export function refClips(idx, spellId) {
  return idx?.[spellId] ?? [];
}

// Returns an element that fills itself with a looping muted clip if one exists; stays hidden otherwise.
export function refClip(spellId, { compact = false } = {}) {
  const box = h("figure", { class: `refclip${compact ? " compact" : ""}`, hidden: true });
  loadIndex().then((idx) => {
    const clips = refClips(idx, spellId);
    if (!clips.length) return;
    let i = Math.floor(Math.random() * clips.length);
    const video = h("video", { muted: true, loop: clips.length === 1, playsinline: true, autoplay: true, preload: "auto", controls: !compact });
    video.muted = true;
    const cap = h("figcaption", {}, "");
    const show = () => { const c = clips[i]; video.src = c.src; cap.textContent = `Как в кино · ${c.channel}`; video.play().catch(() => {}); };
    video.addEventListener("ended", () => { i = (i + 1) % clips.length; show(); });
    video.addEventListener("error", () => { box.hidden = true; });
    show();
    box.append(video, cap);
    box.hidden = false;
  });
  box.destroy = () => { box.querySelector("video")?.pause(); };
  return box;
}
