export function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]/g, "");
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

// 0..1, spaces and punctuation ignored so "экспекто патронум" == "экспектопатронум"
export function similarity(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  const max = Math.max(x.length, y.length);
  if (max === 0 || !x.length || !y.length) return 0;
  return 1 - levenshtein(x, y) / max;
}

// Speech engines often return extra words; score the best window of the target length.
export function bestSimilarity(heard, target) {
  const full = similarity(heard, target);
  const words = String(heard ?? "").split(/\s+/).filter(Boolean);
  const n = String(target ?? "").split(/\s+/).filter(Boolean).length;
  let best = full;
  for (let size = Math.max(1, n - 1); size <= n + 1; size++) {
    for (let i = 0; i + size <= words.length; i++) {
      best = Math.max(best, similarity(words.slice(i, i + size).join(" "), target));
    }
  }
  return best;
}
