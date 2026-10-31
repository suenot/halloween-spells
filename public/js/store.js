const NAMES = ["players", "teams", "spells", "stories", "tournaments", "universes", "monsters", "current"];
export const state = {};

// Hosted builds are static: PUT fails, so mutable collections live in this browser's localStorage.
const MUTABLE = new Set(["players", "teams", "tournaments", "current"]);
const LOCAL = "hs-local-";
const localGet = (n) => { try { const v = localStorage.getItem(LOCAL + n); return v == null ? undefined : JSON.parse(v); } catch { return undefined; } };
const localSet = (n, v) => { try { localStorage.setItem(LOCAL + n, JSON.stringify(v)); } catch { /* private mode */ } };

export async function loadAll() {
  await Promise.all(NAMES.map(async (n) => {
    try { state[n] = await (await fetch(`/api/${n}`)).json(); } catch { state[n] = n === "current" ? null : []; }
    const mine = MUTABLE.has(n) ? localGet(n) : undefined;
    if (mine !== undefined) state[n] = mine;
  }));
}

export async function save(name) {
  let ok = false;
  try { ok = (await fetch(`/api/${name}`, { method: "PUT", body: JSON.stringify(state[name]) })).ok; } catch { /* offline */ }
  if (ok) { try { localStorage.removeItem(LOCAL + name); } catch { /* ignore */ } } else if (MUTABLE.has(name)) localSet(name, state[name]);
}

export const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
export const spellById = (id) => state.spells.find((s) => s.id === id);
export const playerById = (id) => state.players.find((p) => p.id === id);

const SETTINGS_KEY = "hs-settings";
const DEFAULTS = { lenient: true, mirror: true, useSpeech: true, useCamera: true, wand: null };
export function settings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") }; } catch { return { ...DEFAULTS }; }
}
export function setSetting(k, v) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings(), [k]: v })); } catch { /* private mode */ }
}
