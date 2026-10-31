import { loadAll } from "./store.js";
import { startAmbient } from "./engine/fx.js";
import { audio } from "./engine/audio.js";
import { mountSoundbar } from "./ui/soundbar.js";

const MOOD = { home: "menu", book: "menu", roster: "menu", stories: "menu", play: "play", board: "board" };

const ROUTES = {
  home: () => import("./ui/home.js"),
  book: () => import("./ui/spellbook.js"),
  roster: () => import("./ui/roster.js"),
  stories: () => import("./ui/stories.js"),
  play: () => import("./ui/game.js"),
  board: () => import("./ui/leaderboard.js"),
};

const view = document.getElementById("view");
let current = null;

function brandLetters() {
  const el = document.getElementById("brand-text");
  const text = el.textContent;
  el.textContent = "";
  [...text].forEach((ch, i) => {
    const s = document.createElement("span");
    s.textContent = ch === " " ? " " : ch;
    s.style.animationDelay = `${150 + i * 45}ms`;
    el.append(s);
  });
}

function moveInk(name) {
  const ink = document.getElementById("nav-ink");
  const link = document.querySelector(`.nav a[data-route="${name}"]`);
  document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("on", a === link));
  if (!link) return;
  ink.style.width = `${link.offsetWidth}px`;
  ink.style.transform = `translateX(${link.offsetLeft}px)`;
}

async function route() {
  const [name, ...rest] = (location.hash.replace(/^#\/?/, "") || "home").split("/");
  const loader = ROUTES[name] ?? ROUTES.home;
  const key = ROUTES[name] ? name : "home";
  moveInk(key);
  document.getElementById("modal-root")?.querySelectorAll(".modal-x").forEach((b) => b.click());
  audio.mood(MOOD[key]);
  audio.sfx("whoosh");
  const mod = await loader();
  const paint = async () => {
    current?.destroy?.();
    view.replaceChildren();
    current = (await mod.render(view, rest)) ?? null;
    scrollTo(0, 0);
  };
  await paint();
}

brandLetters();
await loadAll();
startAmbient(document.getElementById("ambient"));
mountSoundbar(document.getElementById("soundbar"));
addEventListener("click", (e) => { if (e.target?.closest?.(".btn, .seg, .chip.pick, .mode, .nav a, .hist")) audio.sfx("click"); }, true);
addEventListener("hashchange", route);
addEventListener("resize", () => moveInk((location.hash.replace(/^#\/?/, "") || "home").split("/")[0]));
if (document.fonts?.ready) await document.fonts.ready;
route();
