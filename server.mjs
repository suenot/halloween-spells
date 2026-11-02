import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const REF_UNIVERSES = ["harry-potter", "naruto"];
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
  ".mp4": "video/mp4",
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

async function serveStatic(req, res, urlPath, baseDir) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  const full = path.normalize(path.join(baseDir, rel));
  if (!full.startsWith(baseDir)) return send(res, 404, "not found", "text/plain");
  try {
    const type = TYPES[path.extname(full)] ?? "application/octet-stream";
    if (type.startsWith("video/")) return await serveVideo(req, res, full, type);
    send(res, 200, await fs.readFile(full), type);
  } catch {
    send(res, 404, "not found", "text/plain");
  }
}

// Video needs Range support so the browser can seek and loop.
async function serveVideo(req, res, full, type) {
  const { size } = await fs.stat(full);
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  let start = 0, end = size - 1, status = 200;
  if (m && (m[1] || m[2])) {
    start = m[1] ? Number(m[1]) : size - Number(m[2]);
    end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start > end || start >= size) { res.writeHead(416, { "content-range": `bytes */${size}` }); return res.end(); }
    status = 206;
  }
  const headers = { "content-type": type, "accept-ranges": "bytes", "content-length": end - start + 1, "cache-control": "no-store" };
  if (status === 206) headers["content-range"] = `bytes ${start}-${end}/${size}`;
  res.writeHead(status, headers);
  createReadStream(full, { start, end }).pipe(res);
}

export function startServer(port = 5173, dataDir = path.join(ROOT, "data")) {
  const publicDir = path.join(ROOT, "public");
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        return await api(req, res, url.pathname.slice(5), dataDir);
      }
      // Local-only reference clips (gitignored, never deployed): /refs/* -> references/*
      if (REF_UNIVERSES.some((u) => url.pathname.startsWith(`/refs/${u}/`))) return await serveStatic(req, res, url.pathname.slice(5), path.join(ROOT, "references"));
      await serveStatic(req, res, url.pathname, publicDir);
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
