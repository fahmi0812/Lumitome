#!/usr/bin/env node
/**
 * Shim MCP codemem. Engine memulai MCP dengan cwd = folder sesi.
 * - Di dalam repo git: jalankan codebase-memory-mcp (stdio diteruskan apa adanya), stderr ke $LUMI_HOME/logs/codemem.err.
 * - Di luar git (atau LUMI_CODEMEM=0): jawab MCP sendiri tanpa tool, supaya folder biasa tidak menunggu binary besar.
 * Tidak pernah menjalankan `install`/`update`.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { gitRoot } from "./codemem.mjs";

const bin = process.argv[2];
const env = process.env;
const enabled = env.LUMI_CODEMEM !== "0" && bin && fs.existsSync(bin) && (env.LUMI_CODEMEM === "1" || gitRoot(process.cwd()));

if (enabled) {
  let err = "ignore";
  try { const dir = path.join(env.LUMI_HOME || path.dirname(path.dirname(bin)), "logs"); fs.mkdirSync(dir, { recursive: true }); err = fs.openSync(path.join(dir, "codemem.err"), "a"); } catch {}
  const child = spawn(bin, [], { stdio: ["inherit", "inherit", err], windowsHide: true });
  for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { try { child.kill(s); } catch {} });
  child.on("error", (e) => { try { if (typeof err === "number") fs.writeSync(err, `shim: ${e.message}\n`); } catch {} process.exit(1); });
  child.on("exit", (code, sig) => process.exit(code ?? (sig ? 1 : 0)));
} else {
  const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
  readline.createInterface({ input: process.stdin }).on("line", (line) => {
    let m; try { m = JSON.parse(line); } catch { return; }
    if (m.id === undefined || m.id === null) return;
    const r = {
      initialize: { protocolVersion: m.params?.protocolVersion || "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "codemem-off", version: "0" }, instructions: "codemem hanya aktif di repo git." },
      ping: {}, "tools/list": { tools: [] }, "resources/list": { resources: [] }, "prompts/list": { prompts: [] },
    }[m.method];
    send(r ? { jsonrpc: "2.0", id: m.id, result: r } : { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: `method tidak didukung: ${m.method}` } });
  });
}
