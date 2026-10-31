import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createTournament, nextTurn, recordAttempt, standings, teamStandings, isFinished } from "../public/js/core/tournament.js";

const load = (n) => JSON.parse(fs.readFileSync(new URL(`../data/${n}.json`, import.meta.url), "utf8"));
const spells = load("spells");
const stories = load("stories");
const kids = JSON.parse(fs.readFileSync(new URL("../data/seed/players.json", import.meta.url), "utf8")).filter((p) => p.kind === "child");

test("solo: round-robin queue, standings, ties share rank", () => {
  const solo = stories.find((s) => s.id === "solo-wizard");
  let t = createTournament({ players: kids.slice(0, 3), mode: "solo", story: solo, spells });
  assert.equal(t.queue.length, 3 * solo.spellIds.length);
  assert.equal(t.queue[0].spellId, solo.spellIds[0]);
  assert.equal(t.queue[1].playerId, kids[1].id);
  t = recordAttempt(t, { turn: 0, playerId: kids[0].id, spellId: "lumos", total: 100, success: true });
  t = recordAttempt(t, { turn: 1, playerId: kids[1].id, spellId: "lumos", total: 100, success: true });
  t = recordAttempt(t, { turn: 2, playerId: kids[2].id, spellId: "lumos", total: 40, success: false });
  const s = standings(t);
  assert.deepEqual(s.map((r) => r.rank), [1, 1, 3]);
  assert.equal(nextTurn(t).index, 3);
});

test("repeat attempt of a turn replaces the earlier one", () => {
  let t = createTournament({ players: kids.slice(0, 2), mode: "solo", spells });
  t = recordAttempt(t, { turn: 0, playerId: kids[0].id, total: 10, success: false });
  t = recordAttempt(t, { turn: 0, playerId: kids[0].id, total: 90, success: true });
  assert.equal(t.attempts.length, 1);
  assert.equal(standings(t)[0].total, 90);
  assert.equal(t.cursor, 1);
});

test("empty tournament throws, single player works, no NaN", () => {
  assert.throws(() => createTournament({ players: [], mode: "solo", spells }));
  const t = createTournament({ players: kids.slice(0, 1), mode: "solo", spells });
  assert.equal(standings(t)[0].total, 0);
  assert.equal(isFinished(t), false);
});

test("ensemble: 8 roles over 3 players wrap, scenes follow roles", () => {
  const story = stories.find((s) => s.id === "pumpkin-castle");
  const t = createTournament({ players: kids.slice(0, 3), mode: "ensemble", story, spells });
  assert.equal(t.queue.length, story.scenes.length);
  assert.equal(t.queue[0].playerId, t.assignment[story.scenes[0].roleId]);
  assert.ok(t.queue[0].text);
});

test("teams: alternate turns, team standings sum members", () => {
  const teams = [
    { id: "a", name: "A", color: "#f00", playerIds: [kids[0].id, kids[1].id] },
    { id: "b", name: "B", color: "#00f", playerIds: [kids[2].id] },
  ];
  let t = createTournament({ players: kids.slice(0, 3), mode: "teams", teams, spells });
  assert.deepEqual(t.queue.map((q) => q.playerId), [kids[0].id, kids[2].id, kids[1].id]);
  t = recordAttempt(t, { turn: 0, playerId: kids[0].id, total: 50, success: true });
  t = recordAttempt(t, { turn: 1, playerId: kids[2].id, total: 70, success: true });
  t = recordAttempt(t, { turn: 2, playerId: kids[1].id, total: 40, success: true });
  assert.deepEqual(teamStandings(t).map((x) => [x.teamId, x.total]), [["a", 90], ["b", 70]]);
  assert.throws(() => createTournament({ players: kids.slice(0, 3), mode: "teams", teams: [teams[0]], spells }));
});

test("chorus: one turn per monster, playerless attempts keep standings valid", () => {
  const monsters = load("monsters");
  let t = createTournament({ players: kids.slice(0, 3), mode: "chorus", monsters });
  assert.equal(t.queue.length, monsters.length);
  assert.equal(t.queue[0].playerId, null);
  t = recordAttempt(t, { turn: 0, playerId: null, spellId: t.queue[0].spellId, total: 120, success: true });
  assert.equal(t.cursor, 1);
  assert.ok(standings(t).every((r) => r.total === 0));
  assert.throws(() => createTournament({ players: kids, mode: "chorus", monsters: [] }));
});
