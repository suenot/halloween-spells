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

// Latin output (some engines spell foreign words) mapped onto Cyrillic sounds.
const LATIN = [
  ["sch", "ш"], ["sh", "ш"], ["ch", "ч"], ["zh", "ж"], ["kh", "х"], ["ts", "ц"], ["ph", "ф"], ["th", "т"], ["qu", "кв"],
  ["ai", "ай"], ["ay", "ай"], ["ei", "ей"], ["ey", "ей"], ["oi", "ой"], ["oy", "ой"], ["ee", "и"], ["oo", "у"], ["ou", "у"], ["ea", "и"],
  ["a", "а"], ["b", "б"], ["c", "к"], ["d", "д"], ["e", "е"], ["f", "ф"], ["g", "г"], ["h", "х"], ["i", "и"], ["j", "дж"],
  ["k", "к"], ["l", "л"], ["m", "м"], ["n", "н"], ["o", "о"], ["p", "п"], ["q", "к"], ["r", "р"], ["s", "с"], ["t", "т"],
  ["u", "у"], ["v", "в"], ["w", "в"], ["x", "кс"], ["y", "и"], ["z", "з"],
];
const SOUND = { ы: "и", э: "и", е: "и", ё: "о", о: "а", я: "а", ю: "у", б: "п", в: "ф", г: "к", д: "т", ж: "ш", з: "с", щ: "ш", ц: "тс", х: "к" };

function toCyrillic(s) {
  let out = "", i = 0;
  while (i < s.length) {
    const hit = /[a-z]/.test(s[i]) ? LATIN.find(([l]) => s.startsWith(l, i)) : null;
    if (hit) { out += hit[1]; i += hit[0].length; } else { out += s[i]; i++; }
  }
  return out;
}

// Rough Russian sound form: unstressed vowels and voiced/voiceless pairs merged, doubled letters collapsed.
export function phonetic(text) {
  const base = toCyrillic(String(text ?? "").toLowerCase().replaceAll("ё", "о")).replace(/[ъь]/g, "");
  return normalize(base).replace(/./g, (c) => SOUND[c] ?? c).replace(/(.)\1+/g, "$1");
}

export function phoneticSimilarity(a, b) {
  const x = phonetic(a);
  const y = phonetic(b);
  const max = Math.max(x.length, y.length);
  if (max === 0 || !x.length || !y.length) return 0;
  return 1 - levenshtein(x, y) / max;
}

// Speech engines often return extra words; score the best window of the target length.
function bestWindow(heard, target, score) {
  let best = score(heard, target);
  const words = String(heard ?? "").split(/\s+/).filter(Boolean);
  const n = String(target ?? "").split(/\s+/).filter(Boolean).length;
  for (let size = Math.max(1, n - 1); size <= n + 1; size++) {
    for (let i = 0; i + size <= words.length; i++) {
      best = Math.max(best, score(words.slice(i, i + size).join(" "), target));
    }
  }
  return best;
}

export const bestSimilarity = (heard, target) => bestWindow(heard, target, similarity);

// What the game uses: spelling match or sound match, whichever is closer (kids and engines both bend words).
export const matchScore = (heard, target) => Math.max(bestWindow(heard, target, similarity), bestWindow(heard, target, phoneticSimilarity));
