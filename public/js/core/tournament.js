// Pure tournament logic. A tournament is plain JSON so it can be saved after every turn.
// queue item: { playerId, spellId, text? }   attempt: { turn, playerId, spellId, word, gesture, total, success, manual, at }

export function createTournament({ players, mode, spells = [], story = null, teams = [], monsters = [], name, rng = Math.random, now = Date.now }) {
  if (!players?.length) throw new Error("Нужен хотя бы один игрок");
  let queue = [];
  const base = {
    id: `t-${now().toString(36)}`, mode, name: name ?? "Турнир", startedAt: now(), finishedAt: null,
    storyId: story?.id ?? null, playerIds: players.map((p) => p.id), teams: [], cursor: 0, attempts: [],
  };
  if (mode === "ensemble") {
    if (story?.mode !== "ensemble") throw new Error("Нужен сюжет с ролями");
    const assignment = new Map();
    story.roles.forEach((r, i) => assignment.set(r.id, players[i % players.length].id));
    base.assignment = Object.fromEntries(assignment);
    const roleById = new Map(story.roles.map((r) => [r.id, r]));
    queue = story.scenes.map((sc) => ({ playerId: assignment.get(sc.roleId), spellId: roleById.get(sc.roleId).spellId, text: sc.text, roleId: sc.roleId }));
  } else if (mode === "chorus") {
    // everyone chants together: one turn per monster, playerId is null (the whole party)
    if (!monsters.length) throw new Error("Нужны монстры");
    queue = monsters.map((m) => ({ playerId: null, monsterId: m.id, spellId: m.spellId, text: m.action }));
  } else if (mode === "teams") {
    if (teams.length < 2) throw new Error("Нужны две команды");
    base.teams = teams.map((t) => ({ ...t }));
    const rounds = Math.max(...teams.map((t) => t.playerIds.length));
    for (let r = 0; r < rounds; r++) {
      for (const t of teams) {
        const pid = t.playerIds[r % Math.max(1, t.playerIds.length)];
        if (pid && r < t.playerIds.length) queue.push({ playerId: pid, spellId: spells[r % spells.length].id });
      }
    }
  } else {
    // solo: round-robin, each round every player casts the same spell of their scenario
    const ids = story?.spellIds ?? spells.map((s) => s.id);
    for (const spellId of ids) for (const p of players) queue.push({ playerId: p.id, spellId });
  }
  return { ...base, queue };
}

export const nextTurn = (t) => (t.cursor < t.queue.length ? { index: t.cursor, ...t.queue[t.cursor] } : null);

// Repeating a turn replaces the earlier attempt for that turn.
export function recordAttempt(t, attempt, now = Date.now) {
  const a = { manual: false, at: now(), ...attempt };
  const attempts = [...t.attempts.filter((x) => x.turn !== a.turn), a].sort((x, y) => x.turn - y.turn);
  return { ...t, attempts, cursor: Math.max(t.cursor, a.turn + 1) };
}

export function standings(t) {
  const rows = t.playerIds.map((playerId) => {
    const mine = t.attempts.filter((a) => a.playerId === playerId);
    return { playerId, total: mine.reduce((s, a) => s + (a.total || 0), 0), successes: mine.filter((a) => a.success).length, attempts: mine.length };
  });
  rows.sort((a, b) => b.total - a.total || b.successes - a.successes);
  let rank = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.total !== rows[i - 1].total || r.successes !== rows[i - 1].successes) rank = i + 1;
    return { ...r, rank };
  });
}

export function teamStandings(t) {
  const byPlayer = new Map(standings(t).map((r) => [r.playerId, r]));
  return t.teams
    .map((team) => ({ teamId: team.id, name: team.name, color: team.color, total: team.playerIds.reduce((s, id) => s + (byPlayer.get(id)?.total ?? 0), 0), successes: team.playerIds.reduce((s, id) => s + (byPlayer.get(id)?.successes ?? 0), 0) }))
    .sort((a, b) => b.total - a.total);
}

export const isFinished = (t) => t.cursor >= t.queue.length;
export const finishTournament = (t, now = Date.now) => ({ ...t, finishedAt: t.finishedAt ?? now() });
