#!/usr/bin/env node
/**
 * MCP stdio server read-only: tool `skill_search`, dibatasi SATU sektor (allowlist agent sektor di skills.db).
 * Pakai: node router/skill-search-mcp.mjs --sector coding
 * Tanpa dependensi (JSON-RPC 2.0 newline-delimited, sesuai transport stdio MCP). DB dibuka readOnly.
 */
import readline from "node:readline";
import path from "node:path";
import fs from "node:fs";
import { openDb, searchSkills, SECTORS, DEFAULT_DB } from "./skill-db.mjs";

const i = process.argv.indexOf("--sector");
const sector = i >= 0 ? process.argv[i + 1] : process.env.SW_SECTOR;
if (!SECTORS.includes(sector)) { process.stderr.write(`sektor tidak valid: ${sector}\n`); process.exit(2); }
const root = process.env.SW_ROOT || process.cwd();
const dbFile = path.join(root, DEFAULT_DB);
const VERSION = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const TOOL = {
  name: "skill_search",
  title: `Cari skill sektor ${sector}`,
  description: `Cari skill Swanwright (read-only) HANYA di allowlist sektor ${sector}. Kembalikan nama + deskripsi singkat; muat skill lewat tool skill({name}).`,
  inputSchema: { type: "object", properties: { query: { type: "string", minLength: 2, maxLength: 500 }, k: { type: "integer", minimum: 1, maximum: 10, default: 5 } }, required: ["query"], additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

let db = null;
function getDb() {
  if (db) return db;
  if (!fs.existsSync(dbFile)) throw new Error(`indeks belum ada (${DEFAULT_DB}); jalankan: npm run skills:index`);
  db = openDb(dbFile, { readOnly: true });
  return db;
}

async function call(name, args) {
  if (name !== "skill_search") throw Object.assign(new Error(`tool tidak dikenal: ${name}`), { code: -32602 });
  const q = String(args?.query || "").slice(0, 500);
  const k = Math.min(10, Math.max(1, Number(args?.k) || 5));
  if (q.trim().length < 2) return { content: [{ type: "text", text: "query terlalu pendek" }], isError: true };
  const r = await searchSkills(getDb(), [q], { agent: `sectors/${sector}`, n: k });
  const results = r.candidates.map((c) => ({ name: c.name, score: c.score, ask: c.ask, description: c.description }));
  return { content: [{ type: "text", text: JSON.stringify({ sector, query: q, results }) }], structuredContent: { sector, results } };
}

const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg; try { msg = JSON.parse(line); } catch { return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
  const { id, method, params } = msg;
  if (id === undefined || id === null) return; // notifikasi
  try {
    let result;
    if (method === "initialize") result = { protocolVersion: params?.protocolVersion || "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: `swanwright-skills-${sector}`, version: VERSION }, instructions: `Pakai skill_search bila butuh skill sektor ${sector} yang belum diberikan orchestrator. Hanya membaca indeks.` };
    else if (method === "ping") result = {};
    else if (method === "tools/list") result = { tools: [TOOL] };
    else if (method === "tools/call") result = await call(params?.name, params?.arguments);
    else if (method === "resources/list") result = { resources: [] };
    else if (method === "prompts/list") result = { prompts: [] };
    else return send({ jsonrpc: "2.0", id, error: { code: -32601, message: `method tidak didukung: ${method}` } });
    send({ jsonrpc: "2.0", id, result });
  } catch (e) { send({ jsonrpc: "2.0", id, error: { code: e.code || -32603, message: String(e.message) } }); }
});
