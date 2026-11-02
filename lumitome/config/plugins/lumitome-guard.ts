/**
 * Lumitome guard plugin (OpenCode V2). Dimuat dari OPENCODE_CONFIG_DIR oleh wrapper `lumitome`,
 * jadi berlaku walau config proyek (mis. Swanwright `shell * allow`) dimuat belakangan.
 * Fail-closed: bila modul guard/bwrap tidak tersedia, semua shell & tool tulis ditolak.
 * tool.execute.before: tolak (throw) / bungkus bwrap; tool.execute.after: jurnal + anti-spin.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHELL = new Set(["shell", "bash"]);
const FILE = new Set(["read", "edit", "write", "glob", "grep", "list", "patch", "multiedit", "apply_patch"]);
const env = process.env;
const WS0 = env.LUMI_WORKSPACE || process.cwd();
const JOURNAL = env.LUMI_JOURNAL || "";
const jot = (row: Record<string, unknown>) => { if (JOURNAL) try { fs.appendFileSync(JOURNAL, JSON.stringify({ t: Date.now(), ...row }) + "\n"); } catch { /* jurnal opsional */ } };

export default {
  id: "lumitome-guard",
  async setup(ctx: any) {
    // service dipakai ulang lintas folder (v0.3.13): workspace = folder lokasi sesi ini, bukan folder wrapper pertama
    const WS = (() => { const d = ctx?.location?.directory; if (!d) return WS0; try { return fs.realpathSync(d); } catch { return String(d); } })();
    let g: any = null; let closed = "";
    // Spesifier dibangun saat runtime (bukan literal): pemindai dependensi plugin engine membaca import literal relatif.
    // Dari salinan di LUMI_HOME/config/plugins, folder harness tiga tingkat di atas tidak ada → engine memantau folder induk terdekat
    // yang ada (mis. /home atau C:\Users) secara rekursif tiap folder dibuka.
    const fallback = ["..", "..", "..", "harness", "lumi-guard.mjs"].join("/");
    try { g = await import(env.LUMI_HARNESS ? pathToFileURL(env.LUMI_HARNESS).href : new URL(fallback, import.meta.url).href); }
    catch (e) { closed = `LUMI_GUARD_CLOSED: modul guard gagal dimuat (${String(e)}) — shell & tool tulis ditolak`; }
    const sandbox = env.LUMI_SANDBOX || "bwrap";
    if (g && sandbox === "bwrap" && !g.bwrapAvailable()) closed = "SANDBOX_CLOSED: bwrap tidak tersedia/tidak bisa membuat namespace. Shell ditolak (fail-closed). Pasang bubblewrap (apt install bubblewrap) atau set LUMI_SANDBOX=off secara sadar.";
    const spin = g ? new g.RuntimeSpin({ maxFail: Number(env.LUMI_SPIN_MAX_FAIL || 3), maxRepeat: Number(env.LUMI_SPIN_MAX_REPEAT || 4) }) : null;
    const toolDirs = (env.LUMI_TOOLDIRS || "").split(path.delimiter).filter(Boolean);
    const headless = env.LUMI_HEADLESS === "1";
    jot({ kind: "guard", status: closed ? "closed" : "ok", sandbox, ws: WS, reason: closed || undefined });

    await ctx.tool.hook("execute.before", (e: any) => {
      const tool = String(e.tool);
      if (!SHELL.has(tool) && !FILE.has(tool)) return;
      if (closed && (SHELL.has(tool) || tool !== "read" && tool !== "glob" && tool !== "grep" && tool !== "list")) { jot({ kind: "deny", tool, rule: "closed" }); throw new Error(closed); }
      const s = spin!.before(tool, SHELL.has(tool) ? { command: String(e.input?.command ?? "") } : e.input);
      if (s.effect === "deny") { jot({ kind: "spin", tool, reason: s.reason }); throw new Error(s.reason); }
      if (FILE.has(tool)) {
        const d = g.classifyFileTool(tool, e.input || {}, { workspace: WS });
        if (d.effect === "deny") { jot({ kind: "deny", tool, rule: d.rule }); throw new Error(d.reason); }
        return;
      }
      const command = String(e.input?.command ?? "");
      const d = g.classifyShell(command, { workspace: WS, headless });
      if (d.effect === "deny") { jot({ kind: "deny", tool, rule: d.rule, command }); throw new Error(d.reason); }
      if (sandbox === "bwrap") e.input = { ...e.input, command: g.bwrapCommand(command, { workspace: WS, toolDirs, argsDir: env.LUMI_SBX_DIR }) };
      jot({ kind: "shell-start", command, effect: d.effect });
    });

    await ctx.tool.hook("execute.after", (e: any) => {
      const tool = String(e.tool);
      if (!SHELL.has(tool) && !FILE.has(tool)) return;
      let original = e.input?.command;
      if (SHELL.has(tool) && typeof original === "string" && g) original = g.unwrapCommand(original);
      const exit = e.result?.metadata?.exit ?? e.result?.output?.exit;
      const ok = e.status === "completed" && (exit === undefined || exit === 0);
      const input = SHELL.has(tool) ? { command: String(original ?? "") } : e.input;
      spin?.after(tool, input, ok);
      const out = (() => { const parts = [e.result?.output, e.result?.metadata?.output, ...(Array.isArray(e.result?.content) ? e.result.content.map((c: any) => c?.text) : [e.result?.content])];
        return parts.map((o) => (typeof o === "string" ? o : o == null ? "" : JSON.stringify(o))).join("\n"); })();
      const failed_output = SHELL.has(tool) && g?.testOutputFailed && g.TEST_CMD?.test(String(original ?? "")) ? g.testOutputFailed(out) : false;
      jot(SHELL.has(tool) ? { kind: "shell", command: original, exit: exit ?? null, status: e.status, out_bytes: out.length, ...(failed_output ? { failed_output: true } : {}) } : { kind: "tool", tool, status: e.status });
    });
  },
};
