/**
 * Lumitome guard plugin (OpenCode V2). Dimuat dari OPENCODE_CONFIG_DIR oleh wrapper `lumitome`,
 * jadi berlaku walau config proyek (mis. Swanwright `shell * allow`) dimuat belakangan.
 * Fail-closed: bila modul guard/bwrap tidak tersedia, semua shell & tool tulis ditolak.
 * tool.execute.before: tolak (throw) / bungkus bwrap; tool.execute.after: jurnal + anti-spin.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

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
    const fallbackPath = fileURLToPath(new URL(fallback, import.meta.url));
    // P1-2 (4): LUMI_HARNESS hanya boleh menunjuk path di bawah ~/.lumitome/ atau
    // modul guard bawaan. Cek ini diduplikasi sebaris di sini (bootstrap: validator
    // resolveHarnessPath tinggal di modul yang sedang divalidasi). Symlink dicek
    // lewat realpath. Di luar itu: guard tertutup (fail-closed), pesan jelas.
    const lumiHomeP = env.LUMI_HOME || path.join(env.HOME || os.homedir(), ".lumitome");
    const withinP = (base: string, p: string) => { const r = path.relative(path.resolve(base), path.resolve(p)); return r === "" || (!r.startsWith("..") && !path.isAbsolute(r)); };
    const realOf = (p: string) => { try { return fs.realpathSync(p); } catch { return p; } };
    // Modul guard bawaan: fallback apa adanya + fallback dari lokasi riil plugin
    // (plugin dimuat lewat symlink LUMI_HOME/config → repo; wrapper menyetel
    // LUMI_HARNESS ke path repo itu).
    const pluginRealDir = (() => { try { return path.dirname(fs.realpathSync(fileURLToPath(import.meta.url))); } catch { return ""; } })();
    const builtinPaths = [fallbackPath, ...(pluginRealDir ? [path.resolve(pluginRealDir, "..", "..", "..", "harness", "lumi-guard.mjs")] : [])];
    const builtinReal = builtinPaths.map(realOf);
    let harnessPath: string | null = null;
    if (env.LUMI_HARNESS) {
      const raw = String(env.LUMI_HARNESS);
      const p = raw === "~" ? (env.HOME || os.homedir()) : raw.startsWith("~/") ? path.join(env.HOME || os.homedir(), raw.slice(2)) : path.resolve(raw);
      const rp = realOf(p);
      const okH = (x: string) => withinP(lumiHomeP, x) || builtinPaths.includes(x) || builtinReal.includes(x);
      if (okH(p) && okH(rp)) harnessPath = p;
      else closed = `LUMI_GUARD_CLOSED: LUMI_HARNESS '${raw}' ditolak — hanya path di bawah ${lumiHomeP}/ (atau modul guard bawaan Lumitome) yang diizinkan; shell & tool tulis ditolak`;
    }
    if (!closed) {
      try { g = await import(harnessPath ? pathToFileURL(harnessPath).href : new URL(fallback, import.meta.url).href); }
      catch (e) { closed = `LUMI_GUARD_CLOSED: modul guard gagal dimuat (${String(e)}) — shell & tool tulis ditolak`; }
    }
    const spin = g ? new g.RuntimeSpin({ maxFail: Number(env.LUMI_SPIN_MAX_FAIL || 3), maxRepeat: Number(env.LUMI_SPIN_MAX_REPEAT || 4) }) : null;
    const toolDirs = (env.LUMI_TOOLDIRS || "").split(path.delimiter).filter(Boolean);
    const headless = env.LUMI_HEADLESS === "1";
    // v0.3.19: tier kepercayaan per proyek (strict/standard/trusted) + akar proyek + file memori ancestor.
    // Tier dibaca dari file trust milik user di luar workspace (tidak bisa diubah agent) atau env LUMI_TRUST_TIER.
    // Default standard: kebijakan tulis sama, tanpa bwrap. strict: bwrap wajib (fail-closed bila tidak ada).
    let SP: any = null; let TIER = "standard"; let SCOPE: any = null;
    if (g) { try { SCOPE = g.buildSandboxScope(WS, { home: env.HOME || os.homedir(), lumiHome: env.LUMI_HOME || path.join(env.HOME || os.homedir(), ".lumitome"), env }); SP = SCOPE.sp; TIER = SCOPE.tier; } catch (e) { closed ||= `LUMI_GUARD_CLOSED: kebijakan sandbox gagal dibuat (${String(e)}) — shell & tool tulis ditolak`; } }
    const sandbox = env.LUMI_SANDBOX || (TIER === "strict" ? "bwrap" : "off");
    const sandboxSource = env.LUMI_SANDBOX ? "env" : "default";
    const tierSource = SCOPE?.tierSource || "default";
    if (g && sandbox === "bwrap" && !g.bwrapAvailable()) closed = "SANDBOX_CLOSED: bwrap tidak tersedia/tidak bisa membuat namespace. Shell ditolak (fail-closed). Pasang bubblewrap (apt install bubblewrap), turunkan tier (lumitome trust standard), atau set LUMI_SANDBOX=off secara sadar.";
    jot({ kind: "guard", status: closed ? "closed" : "ok", sandbox, sandboxSource, tier: TIER, tierSource, ws: WS, root: SCOPE?.root, write: SP?.write, reason: closed || undefined });
    // P1-2 (2): tier dari env (bukan file trust) + penurunan sandbox via env — visibilitas, bukan blokir.
    if (tierSource === "env") jot({ kind: "tier-env", tier: TIER, source: "env", ws: WS, reason: "tier dari env LUMI_TRUST_TIER, bukan file trust (~/.lumitome/trust.json)" });
    if (sandbox === "off" && TIER === "strict" && sandboxSource === "env") jot({ kind: "sandbox-downgraded", tier: TIER, sandbox, ws: WS, reason: "LUMI_SANDBOX=off menurunkan tier strict (kehilangan bwrap)" });

    await ctx.tool.hook("execute.before", (e: any) => {
      const tool = String(e.tool);
      // P1-2 (3): tool di luar daftar (MCP, webfetch, sub-agent, …) tidak diblokir —
      // daftar tool OpenCode tidak lengkap — tapi dicatat sebagai unguarded di jurnal.
      if (!SHELL.has(tool) && !FILE.has(tool)) { jot({ kind: "unguarded", tool }); return; }
      if (!g) {
        // Guard gagal dimuat: fail-closed untuk tulis, baca tetap jalan (urutan ada di g.evaluateTool).
        if (SHELL.has(tool) || (tool !== "read" && tool !== "glob" && tool !== "grep" && tool !== "list")) { jot({ kind: "deny", tool, rule: "closed" }); throw new Error(closed); }
        return;
      }
      // Urutan penegakan tinggal di guard (harness/lumi-guard.mjs: evaluateTool); plugin hanya wiring.
      const command = SHELL.has(tool) ? String(e.input?.command ?? "") : "";
      const r = g.evaluateTool(tool, e.input || {}, { workspace: WS, sandbox: SP, tier: TIER, headless, toolDirs, argsDir: env.LUMI_SBX_DIR, sandboxMode: sandbox, spin, closed, lumiHome: env.LUMI_HOME || "" });
      if (r.effect === "deny") {
        jot(r.rule === "spin" ? { kind: "spin", tool, reason: r.reason } : { kind: "deny", tool, rule: r.rule, ...(r.command ? { command: r.command } : {}) });
        throw new Error(r.reason);
      }
      if (r.rewrite) e.input = { ...e.input, command: r.rewrite.command };
      if (SHELL.has(tool)) jot({ kind: "shell-start", command, effect: r.effect });
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
