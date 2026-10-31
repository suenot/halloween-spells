import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { WAND, SEALS, MOTIONS } from "../public/js/core/gestures.js";

const load = (n) => JSON.parse(fs.readFileSync(new URL(`../data/${n}.json`, import.meta.url), "utf8"));
const spells = load("spells");
const players = JSON.parse(fs.readFileSync(new URL("../data/seed/players.json", import.meta.url), "utf8"));
const stories = load("stories");
const ELEMENTS = ["fire", "water", "earth", "air", "lightning", "ice", "dark", "light"];

test("spells valid", () => {
  assert.equal(new Set(spells.map((s) => s.id)).size, spells.length);
  for (const s of spells) {
    assert.ok(s.name && s.phrase && s.description, s.id);
    assert.ok(ELEMENTS.includes(s.element), s.id);
    assert.ok(s.difficulty >= 1 && s.difficulty <= 5, s.id);
    assert.ok(s.gesture.length > 0, s.id);
    const pool = [...(s.school === "wizard" ? WAND : SEALS), ...MOTIONS];
    for (const g of s.gesture) assert.ok(pool.includes(g), `${s.id}: ${g}`);
  }
  assert.ok(spells.filter((s) => s.school === "wizard").length >= 12);
  assert.ok(spells.filter((s) => s.school === "shinobi").length >= 12);
});

test("players: 8 kids, adults are giants, ids unique", () => {
  assert.equal(new Set(players.map((p) => p.id)).size, players.length);
  assert.equal(players.filter((p) => p.kind === "child").length, 8);
  for (const p of players.filter((p) => p.kind === "adult")) assert.equal(p.race, "giant");
});

test("stories reference real spells and roles", () => {
  const ids = new Set(spells.map((s) => s.id));
  for (const st of stories) {
    if (st.mode === "ensemble") {
      assert.equal(st.roles.length, 8, st.id);
      const roleIds = new Set(st.roles.map((r) => r.id));
      for (const r of st.roles) assert.ok(ids.has(r.spellId), `${st.id}:${r.id}`);
      for (const sc of st.scenes) assert.ok(roleIds.has(sc.roleId), `${st.id} scene`);
    } else {
      for (const id of st.spellIds) assert.ok(ids.has(id), `${st.id}:${id}`);
    }
  }
});

test("universes: players reference valid universe/class/race/faction", () => {
  const universes = load("universes");
  assert.ok(universes.length >= 3);
  for (const u of universes) {
    assert.ok(["wizard", "shinobi"].includes(u.school), u.id);
    assert.ok(u.classes.length && u.races.some((r) => r.id === "giant"), u.id);
  }
  for (const st of stories) if (st.universe !== "mixed") assert.ok(universes.some((u) => u.id === st.universe), st.id);
  for (const p of players) {
    if (!p.universe) continue;
    const u = universes.find((x) => x.id === p.universe);
    assert.ok(u, p.id);
    if (p.class) assert.ok(u.classes.some((c) => c.id === p.class), p.id);
    if (p.race) assert.ok(u.races.some((r) => r.id === p.race), p.id);
    if (p.faction) assert.ok(u.factions.some((f) => f.id === p.faction), p.id);
  }
});

test("monsters reference real spells", () => {
  const ids = new Set(spells.map((s) => s.id));
  const monsters = load("monsters");
  assert.ok(monsters.length >= 6);
  for (const m of monsters) { assert.ok(ids.has(m.spellId), m.id); assert.ok(m.hp >= 1, m.id); }
});
