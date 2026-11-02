import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startServer } from "../server.mjs";

async function withServer(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hs-"));
  const server = await startServer(0, dir);
  const base = `http://localhost:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test("PUT then GET returns the same data", () =>
  withServer(async (base) => {
    const data = [{ id: "p1", name: "Тимур" }];
    const put = await fetch(`${base}/api/players`, { method: "PUT", body: JSON.stringify(data) });
    assert.equal(put.status, 200);
    const got = await (await fetch(`${base}/api/players`)).json();
    assert.deepEqual(got, data);
  }));

test("teams is a known collection, empty by default", () =>
  withServer(async (base) => {
    assert.deepEqual(await (await fetch(`${base}/api/teams`)).json(), []);
  }));

test("unknown name is 404, path traversal is 404", () =>
  withServer(async (base) => {
    assert.equal((await fetch(`${base}/api/secrets`)).status, 404);
    assert.equal((await fetch(`${base}/api/..%2Fserver`)).status, 404);
  }));

test("bad json is 400", () =>
  withServer(async (base) => {
    const r = await fetch(`${base}/api/spells`, { method: "PUT", body: "{nope" });
    assert.equal(r.status, 400);
  }));

test("reference clips: only known universes, no traversal, 404 when missing", () =>
  withServer(async (base) => {
    assert.equal((await fetch(`${base}/refs/harry-potter/none/none.mp4`)).status, 404);
    assert.equal((await fetch(`${base}/refs/hp_candidates.json`)).status, 404);
    assert.equal((await fetch(`${base}/refs/naruto/none/none.mp4`)).status, 404);
    assert.equal((await fetch(`${base}/refs/secret/x.mp4`)).status, 404);
    assert.equal((await fetch(`${base}/refs/harry-potter/..%2F..%2Fserver.mjs`)).status, 404);
  }));
