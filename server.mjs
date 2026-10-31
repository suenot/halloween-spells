import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const NAMES = new Set(["players", "teams", "spells", "stories", "tournaments", "universes", "monsters", "current"]);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".wasm": "application/wasm",
  ".task": "application/octet-stream",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

async function api(req, res, name, dataDir) {
  if (!NAMES.has(name)) return send(res, 404, '{"error":"not found"}');
  const file = path.join(dataDir, `${name}.json`);
  if (req.method === "GET") {
    for (const f of [file, path.join(dataDir, "seed", `${name}.json`)]) {
      try {
        return send(res, 200, await fs.readFile(f, "utf8"));
      } catch { /* try the seed next */ }
    }
    return send(res, 200, name === "current" ? "null" : "[]");
  }
  if (req.method === "PUT") {
    const body = await readBody(req);
    try {
      JSON.parse(body);
    } catch {
      return send(res, 400, '{"error":"bad json"}');
    }
    await fs.mkdir(dataDir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, body);
    await fs.rename(tmp, file);
    return send(res, 200, '{"ok":true}');
  }
  send(res, 405, '{"error":"method"}');
}

async function serveStatic(res, urlPath, publicDir) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  const full = path.normalize(path.join(publicDir, rel));
  if (!full.startsWith(publicDir)) return send(res, 404, "not found", "text/plain");
  try {
    const buf = await fs.readFile(full);
    send(res, 200, buf, TYPES[path.extname(full)] ?? "application/octet-stream");
  } catch {
    send(res, 404, "not found", "text/plain");
  }
}

export function startServer(port = 5173, dataDir = path.join(ROOT, "data")) {
  const publicDir = path.join(ROOT, "public");
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        return await api(req, res, url.pathname.slice(5), dataDir);
      }
      await serveStatic(res, url.pathname, publicDir);
    } catch (e) {
      send(res, 500, JSON.stringify({ error: String(e) }));
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 5173;
  await startServer(port);
  console.log(`Halloween Spells: http://localhost:${port}`);
}
