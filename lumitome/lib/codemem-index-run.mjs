// Proses latar auto-index: `codebase-memory-mcp cli --quiet index_repository {"repo_path":dir}` lalu catat status.
import os from "node:os";
import { spawnSync } from "node:child_process";
import { writeIndexState } from "./codemem.mjs";
const [home, dir, bin] = process.argv.slice(2);
try { os.setPriority(19); } catch {}
const r = spawnSync(bin, ["cli", "--quiet", "index_repository", JSON.stringify({ repo_path: dir })], { cwd: dir, encoding: "utf8", timeout: 30 * 60000, windowsHide: true, maxBuffer: 64 << 20 });
let ok = r.status === 0; try { ok = ok && JSON.parse(r.stdout).status === "indexed"; } catch {}
writeIndexState(home, dir, { status: ok ? "indexed" : "failed", finished: Date.now(), exit: r.status, version: "0.12.1" });
