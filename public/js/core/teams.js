const COLORS = ["#ff7a1a", "#7c4dff"];

function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function splitTeams(players, { by = "random", names = ["Тыквы", "Летучие мыши"], rng = Math.random } = {}) {
  const make = (i, ids) => ({ id: `team-${i + 1}`, name: names[i], color: COLORS[i], playerIds: ids });
  if (players.length < 2) {
    return { teams: [make(0, players.map((p) => p.id)), make(1, [])], warning: "Нужно минимум 2 игрока для двух команд" };
  }
  let a;
  let b;
  if (by === "gender" && players.some((p) => p.gender) ) {
    a = players.filter((p) => p.gender === "f");
    b = players.filter((p) => p.gender !== "f");
  } else {
    const s = shuffle(players, rng);
    const half = Math.ceil(s.length / 2);
    a = s.slice(0, half);
    b = s.slice(half);
  }
  const res = { teams: [make(0, a.map((p) => p.id)), make(1, b.map((p) => p.id))] };
  if (!a.length || !b.length) res.warning = "Одна из команд пустая";
  return res;
}
