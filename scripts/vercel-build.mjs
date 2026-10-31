// Static hosting build: serve /api/<name> from public/api-data/<name>.json (read-only; mutable state lives in localStorage).
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public", "api-data");
const MUTABLE = ["players", "teams", "tournaments", "current"];
const FIXED = ["spells", "stories", "universes", "monsters"];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const n of FIXED) fs.copyFileSync(path.join(root, "data", `${n}.json`), path.join(out, `${n}.json`));
for (const n of MUTABLE) fs.copyFileSync(path.join(root, "data", "seed", `${n}.json`), path.join(out, `${n}.json`));
console.log(`api-data: ${FIXED.length + MUTABLE.length} files`);
