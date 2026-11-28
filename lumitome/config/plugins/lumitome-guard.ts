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
const EXEC = new Set(["execute"]);
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
    const builtinHarnessDir = pluginRealDir
      ? path.resolve(pluginRealDir, ["..", "..", "..", "harness"].join("/"))
      : path.dirname(fallbackPath);
    const harnessDir = harnessPath ? path.dirname(harnessPath) : builtinHarnessDir;
    const loadSiblingHarness = async (name: string) => {
      for (const dir of [harnessDir, builtinHarnessDir]) {
        try {
          const p = path.join(dir, name);
          if (fs.existsSync(p)) return await import(pathToFileURL(p).href);
        } catch {}
      }
      return null;
    };
    const defaultSessionId = env.LUMI_SESSION_ID || "default";
    const defaultTaskType = env.LUMI_TASK_TYPE;
    const rg = g ? await loadSiblingHarness("repro-gate.mjs") : null;
    const wm = g ? await loadSiblingHarness("witness.mjs") : null;
    const wd = g ? await loadSiblingHarness("watchdog.mjs") : null;
    const cb = g ? await loadSiblingHarness("context-budget.mjs") : null;
    const taintMod = g ? await loadSiblingHarness("memory/taint.mjs") : null;
    const sandboxMod = g ? await loadSiblingHarness("sandbox/provider.mjs") : null;
    const byopMod = g ? await loadSiblingHarness("byop-guardrail.mjs") : null;
    const taintTrackers = new Map<string, any>();
    const getTaintTracker = (sid: string) => {
      if (!taintMod?.SessionTaintTracker) return null;
      const key = sid || "default";
      if (!taintTrackers.has(key)) {
        const safeSid = String(key).replace(/[^A-Za-z0-9._-]/g, "_") || "default";
        const stateFile = path.join(WS, ".tmp", "session", safeSid, "taint-state.json");
        taintTrackers.set(key, new taintMod.SessionTaintTracker({ sessionId: key, stateFile }));
      }
      return taintTrackers.get(key);
    };
    const watchdogs = new Map<string, any>();
    const getWatchdog = (sid: string) => {
      if (!wd) return null;
      const key = sid || "default";
      if (!watchdogs.has(key)) {
        watchdogs.set(key, new wd.HaltingWatchdog({ workspace: WS, sessionId: key, persistDeadEnds: true }));
      }
      return watchdogs.get(key);
    };
    const spin = g ? new g.RuntimeSpin({ maxFail: Number(env.LUMI_SPIN_MAX_FAIL || 3), maxRepeat: Number(env.LUMI_SPIN_MAX_REPEAT || 4) }) : null;
    const toolDirs = (env.LUMI_TOOLDIRS || "").split(path.delimiter).filter(Boolean);
    const headless = env.LUMI_HEADLESS === "1";
    // v0.3.19: tier kepercayaan per proyek (strict/standard/trusted) + akar proyek + file memori ancestor.
    // Tier dibaca dari file trust milik user di luar workspace (tidak bisa diubah agent) atau env LUMI_TRUST_TIER.
    // v0.3.71: sandbox (bwrap) TIDAK LAGI aktif default — hanya bila LUMI_SANDBOX=bwrap
    // eksplisit (Fahmi: seperti OpenCode biasa). Tier strict TIDAK lagi memaksa
    // bwrap; tanpa bwrap, guard (deny rahasia/destruktif, anti-spin) tetap jalan.
    let SP: any = null; let TIER = "standard"; let SCOPE: any = null;
    if (g) { try { SCOPE = g.buildSandboxScope(WS, { home: env.HOME || os.homedir(), lumiHome: env.LUMI_HOME || path.join(env.HOME || os.homedir(), ".lumitome"), env }); SP = SCOPE.sp; TIER = SCOPE.tier; } catch (e) { closed ||= `LUMI_GUARD_CLOSED: kebijakan sandbox gagal dibuat (${String(e)}) — shell & tool tulis ditolak`; } }
    const sandbox = env.LUMI_SANDBOX === "bwrap" ? "bwrap" : "off";
    const sandboxSource = env.LUMI_SANDBOX ? "env" : "default";
    const tierSource = SCOPE?.tierSource || "default";
    if (sandboxMod && env.LUMI_SANDBOX) {
      try {
        const normMode = sandboxMod.normalizeSandboxMode(env.LUMI_SANDBOX);
        if (normMode === "remote") {
          const rp = new sandboxMod.RemoteSandboxAdapter({ env, lumiHome: lumiHomeP });
          if (!rp.isAvailable()) closed ||= "SANDBOX_CLOSED: LUMI_SANDBOX=remote meminta endpoint & kredensial yang valid (fail-closed)";
        }
      } catch (e: any) {
        closed ||= String(e?.message || e);
      }
    }
    if (g && sandbox === "bwrap" && !g.bwrapAvailable()) closed = "SANDBOX_CLOSED: bwrap tidak tersedia/tidak bisa membuat namespace. Shell ditolak (fail-closed). Pasang bubblewrap (apt install bubblewrap), atau jalankan tanpa LUMI_SANDBOX=bwrap (sandbox mati default).";
    jot({ kind: "guard", status: closed ? "closed" : "ok", sandbox, sandboxSource, tier: TIER, tierSource, ws: WS, root: SCOPE?.root, write: SP?.write, reason: closed || undefined });
    // P1-2 (2): tier dari env (bukan file trust) — visibilitas, bukan blokir.
    if (tierSource === "env") jot({ kind: "tier-env", tier: TIER, source: "env", ws: WS, reason: "tier dari env LUMI_TRUST_TIER, bukan file trust (~/.lumitome/trust.json)" });

    await ctx.tool.hook("execute.before", (e: any) => {
      const tool = String(e.tool);
      const codemode = Boolean(e.codemode);
      const callId = e.id;
      const meta = { ...(codemode ? { codemode: true } : {}), ...(callId ? { callId } : {}) };
      // P1-2 (3): tool di luar daftar (MCP, webfetch, sub-agent, …) tidak diblokir —
      // daftar tool OpenCode tidak lengkap — tapi dicatat sebagai unguarded di jurnal.
      if (!SHELL.has(tool) && !FILE.has(tool) && !EXEC.has(tool)) {
        const sid0 = String(e.sessionID || env.LUMI_SESSION_ID || defaultSessionId);
        const tt = getTaintTracker(sid0);
        const tr = tt?.recordToolOrInput?.({ tool, mcpServer: e.mcpServer });
        jot({ kind: "unguarded", tool, ...(tr?.isTainted ? { taint: tr.taintLevel } : {}), ...meta });
        return;
      }
      if (!g) {
        // Guard gagal dimuat: fail-closed untuk tulis/execute, baca tetap jalan (urutan ada di g.evaluateTool).
        if (SHELL.has(tool) || EXEC.has(tool) || (tool !== "read" && tool !== "glob" && tool !== "grep" && tool !== "list")) { jot({ kind: "deny", tool, rule: "closed", ...meta }); throw new Error(closed); }
        return;
      }
      // Urutan penegakan tinggal di guard (harness/lumi-guard.mjs: evaluateTool); plugin hanya wiring.
      // v0.3.71: sandbox mati default — scope (SP) hanya diteruskan bila
      // bwrap aktif eksplisit; bila off, evaluateTool dipanggil dengan
      // sandbox: null supaya cek scope dilewati (seperti OpenCode biasa).
      const command = SHELL.has(tool) ? String(e.input?.command ?? "") : "";
      const r = g.evaluateTool(tool, e.input || {}, {
        workspace: WS,
        sandbox: sandbox === "bwrap" ? SP : null,
        tier: TIER,
        tierSource,
        headless,
        toolDirs,
        argsDir: env.LUMI_SBX_DIR,
        sandboxMode: sandbox,
        spin,
        closed,
        lumiHome: env.LUMI_HOME || "",
        home: env.HOME || os.homedir(),
        env,
      });
      if (r.effect === "deny") {
        jot(r.rule === "spin" ? { kind: "spin", tool, reason: r.reason, ...meta } : { kind: "deny", tool, rule: r.rule, ...(r.command ? { command: r.command } : {}), ...meta });
        throw new Error(r.reason);
      }
      const sid = String(e.sessionID || env.LUMI_SESSION_ID || defaultSessionId);
      if (rg) {
        const reproRes = rg.checkReproBeforeEdit({
          tool,
          input: e.input || {},
          taskType: e.taskType ?? e.metadata?.taskType ?? defaultTaskType,
          workspace: WS,
          sessionId: sid,
          env,
          headless,
          strictGate: env.LUMI_STRICT_GATE === "1",
        });
        if (reproRes.effect === "deny") {
          jot({ kind: "deny", tool, rule: reproRes.rule, code: reproRes.code, reason: reproRes.reason, ...meta });
          throw new Error(reproRes.reason);
        }
      }
      const dog = getWatchdog(sid);
      if (dog) {
        const wv = dog.beforeStep(tool, e.input || {});
        if (wv.verdict === "HALT") {
          const reason = `[WATCHDOG_HALT] ${wv.reason}: ${wv.detail}`;
          jot({ kind: "watchdog-halt", tool, reason: wv.reason, detail: wv.detail, ...meta });
          throw new Error(reason);
        }
      }
      if (r.rewrite) e.input = { ...e.input, command: r.rewrite.command };
      if (SHELL.has(tool)) jot({ kind: "shell-start", command, effect: r.effect, ...meta });
      const byopModeReq = String(env.LUMI_BYOP_MODE || "").trim().toLowerCase();
      if (byopMod && g?.classifyAction && (byopModeReq === "shadow" || byopModeReq === "enforce")) {
        const actionClass = g.classifyAction(tool, e.input || {});
        if (actionClass === "commit") {
          const tt = getTaintTracker(sid);
          return byopMod.evaluateByopGuardrail({
            actionClass,
            toolName: tool,
            sanitizedArgs: e.input || {},
            taintState: tt?.taintStateDb ?? "clean",
            env,
            headless,
          }).then((bres: any) => {
            if (!bres.allowed) {
              jot({ kind: "deny", tool, rule: "byop-guardrail", reason: bres.reason, ...meta });
              throw new Error(`BYOP_DENY: ${bres.reason}`);
            }
          });
        }
      }
    });

    const extractOut = (res: any) => {
      const parts = [res?.output, res?.metadata?.output, ...(Array.isArray(res?.content) ? res.content.map((c: any) => c?.text) : [res?.content])];
      return parts.map((o) => (typeof o === "string" ? o : o == null ? "" : JSON.stringify(o))).join("\n");
    };
    const applyOffloadToResult = (res: any, summary: string) => {
      if (!res || typeof res !== "object") return;
      if (typeof res.output === "string") res.output = summary;
      else if (res.output && typeof res.output === "object" && typeof res.output.output === "string") res.output.output = summary;
      if (Array.isArray(res.content)) res.content = [{ type: "text", text: summary }];
    };

    await ctx.tool.hook("execute.after", (e: any) => {
      const tool = String(e.tool);
      if (!SHELL.has(tool) && !FILE.has(tool) && !EXEC.has(tool)) return;
      const codemode = Boolean(e.codemode);
      const callId = e.id;
      const sid = String(e.sessionID || env.LUMI_SESSION_ID || defaultSessionId);
      const meta = { ...(codemode ? { codemode: true } : {}), ...(callId ? { callId } : {}) };
      const dog = getWatchdog(sid);
      const runId = String(env.LUMI_RUN_ID || sid || "run");
      if (EXEC.has(tool)) {
        const ok = e.status === "completed" && !e.result?.metadata?.error;
        spin?.after(tool, e.input || {}, ok);
        const execOut = extractOut(e.result);
        const execOff = cb?.offloadLargeOutput && execOut.length > 500
          ? cb.offloadLargeOutput(execOut, { workspaceRoot: WS, runId, callId: callId ? String(callId) : "", threshold: 500, scrub: true })
          : null;
        if (execOff?.offloaded) applyOffloadToResult(e.result, execOff.summary);
        const rawErr = e.result?.metadata?.error ? String(e.result.metadata.error) : "";
        const errText = cb?.scrubSecrets ? cb.scrubSecrets(rawErr) : rawErr;
        dog?.recordStep({ tool, input: e.input || {}, ok, errorText: errText });
        if (wm && rg?.isExecuteMutatingCode?.(e.input?.code)) {
          try { wm.invalidateStaleWitnesses({ sessionDir: wm.sessionDirFor(WS, sid), workspace: WS }); } catch {}
        }
        jot({ kind: "tool", tool, status: e.status, ...(execOff?.offloaded ? { log_path: execOff.relPath, out_bytes: execOff.byte_size } : {}), ...meta });
        return;
      }
      let original = e.input?.command;
      if (SHELL.has(tool) && typeof original === "string" && g) original = g.unwrapCommand(original);
      const shellID = e.result?.metadata?.shellID ?? e.result?.output?.shellID;
      const bg =
        e.result?.metadata?.status === "running" ||
        e.result?.output?.status === "running" ||
        Boolean(shellID);
      const rawExit = e.result?.metadata?.exit ?? e.result?.output?.exitCode ?? e.result?.output?.exit;
      const exit = typeof rawExit === "number" ? rawExit : null;
      const isBg = SHELL.has(tool) && (bg || exit === null);
      const ok = SHELL.has(tool) ? (!isBg && e.status === "completed" && exit === 0) : e.status === "completed";
      const input = SHELL.has(tool) ? { command: String(original ?? "") } : e.input;
      if (!isBg) spin?.after(tool, input, ok);
      const out = extractOut(e.result);
      const failed_output = SHELL.has(tool) && g?.testOutputFailed && g.TEST_CMD?.test(String(original ?? "")) ? g.testOutputFailed(out) : false;
      if (isBg) {
        jot({ kind: "shell-bg", command: cb?.scrubSecrets ? cb.scrubSecrets(original) : original, exit: null, ok: false, status: e.status, ...(shellID ? { shellID } : {}), out_bytes: out.length, ...meta });
        return;
      }
      const shellOff = SHELL.has(tool) && cb?.offloadLargeOutput && out.length > 500
        ? cb.offloadLargeOutput(out, { workspaceRoot: WS, runId, callId: callId ? String(callId) : "", threshold: 500, scrub: true })
        : null;
      if (shellOff?.offloaded) applyOffloadToResult(e.result, shellOff.summary);
      const cleanOut = shellOff ? shellOff.summary : (cb?.scrubSecrets ? cb.scrubSecrets(out) : out);
      if (SHELL.has(tool) && rg && typeof exit === "number") {
        try {
          rg.recordReproProbe({ workspace: WS, sessionId: sid, command: String(original ?? ""), exitCode: exit, output: out });
        } catch {}
      }
      if (SHELL.has(tool) && wm && typeof exit === "number" && g?.TEST_CMD?.test(String(original ?? ""))) {
        try {
          const cmdStr = String(original ?? "");
          const masked = Boolean(g.MASKED_EXIT?.test(cmdStr) || g.afterTest?.(cmdStr));
          wm.recordWitness(wm.sessionDirFor(WS, sid), {
            workspace: WS,
            command: cmdStr,
            output: out,
            exit_code: exit,
            call_id: callId ?? null,
            masked_exit: masked,
            output_failed: Boolean(failed_output),
          });
        } catch {}
      }
      if (!SHELL.has(tool) && g?.WRITE_TOOLS?.has(tool) && e.status === "completed" && wm) {
        try {
          const changed = [e.input?.filePath, e.input?.path, e.input?.file].filter(Boolean);
          wm.invalidateStaleWitnesses({ sessionDir: wm.sessionDirFor(WS, sid), workspace: WS, changedFiles: changed });
        } catch {}
      }
      if (dog) {
        dog.recordStep({
          tool,
          input,
          ok: SHELL.has(tool) ? (ok && !failed_output) : ok,
          errorText: !ok || failed_output ? cleanOut : "",
          exitCode: exit,
        });
      }
      const safeCmd = cb?.scrubSecrets && typeof original === "string" ? cb.scrubSecrets(original) : original;
      jot(SHELL.has(tool)
        ? { kind: "shell", command: safeCmd, exit, ok, status: e.status, out_bytes: out.length, ...(shellOff?.offloaded ? { log_path: shellOff.relPath } : {}), ...(failed_output ? { failed_output: true } : {}), ...meta }
        : { kind: "tool", tool, status: e.status, ...meta });
    });
  },
};
