/**
 * Lumitome Pre-Stop Re-Drive Gate plugin (OpenCode 2.4.2 experimental.idle, M1 / T2.1).
 * Kompatibel aman dengan OpenCode 2.3.0 (capability probe via experimental-adapter).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  defaultLumiHome,
  registerExperimentalHook,
} from "./lib/experimental-adapter.mjs";
import {
  IdleGateController,
  buildRedriveId,
  buildCorrectivePrompt,
  DEFAULT_MAX_REDRIVES,
} from "./lib/idle-gate-core.mjs";

export { IdleGateController, buildRedriveId, buildCorrectivePrompt, DEFAULT_MAX_REDRIVES };

const WRITE_TOOLS = new Set(["edit", "write", "patch", "multiedit", "apply_patch"]);

function resolveHarnessDir() {
  const envRepo = process.env.LUMI_REPO;
  if (envRepo) {
    const p = path.join(path.resolve(envRepo), "harness");
    if (fs.existsSync(p)) return p;
  }
  let dir = path.dirname(fileURLToPath(import.meta.url));
  try {
    dir = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));
  } catch {}
  return path.resolve(dir, ["..", "..", "..", "harness"].join("/"));
}

async function loadHarnessModule(name) {
  try {
    const p = path.join(resolveHarnessDir(), name);
    if (!fs.existsSync(p)) return null;
    return await import(pathToFileURL(p).href);
  } catch {
    return null;
  }
}

function readJournalRows(journalPath) {
  if (!journalPath || !fs.existsSync(journalPath)) return [];
  return fs
    .readFileSync(journalPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function hasGitDiff(ws) {
  try {
    const out = execFileSync("git", ["-C", ws, "status", "--porcelain"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

export default {
  id: "lumitome-idle-gate",
  async setup(ctx: any) {
    const env = process.env;
    const home = defaultLumiHome(env);
    const ws = (() => {
      const d = ctx?.location?.directory || env.LUMI_WORKSPACE || process.cwd();
      try {
        return fs.realpathSync(d);
      } catch {
        return path.resolve(String(d));
      }
    })();

    const guardMod = await loadHarnessModule("lumi-guard.mjs");
    const witnessMod = await loadHarnessModule("witness.mjs");

    const controller = new IdleGateController({
      maxRedrives: Number(env.LUMI_IDLE_MAX_REDRIVES || DEFAULT_MAX_REDRIVES),
      env,
      lumiHome: home,
      onWarning: (msg: string) => process.stderr.write(msg + "\n"),
    });

    // Lacak mutasi, question/BLOCKED, dan subagent aktif via tool hooks (bila ada)
    if (typeof ctx?.tool?.hook === "function") {
      await ctx.tool.hook("execute.before", (e: any) => {
        const sid = String(e?.sessionID || env.LUMI_SESSION_ID || "default");
        const tool = String(e?.tool || "");
        if (tool === "question") controller.markWaitingForUser(sid, true);
        if (tool === "subagent") controller.markSubagentActive(sid, true);
      });
      await ctx.tool.hook("execute.after", (e: any) => {
        const sid = String(e?.sessionID || env.LUMI_SESSION_ID || "default");
        const tool = String(e?.tool || "");
        if (tool === "subagent") controller.markSubagentActive(sid, false);
        if (tool === "question") controller.markWaitingForUser(sid, false);
        if (WRITE_TOOLS.has(tool) && e?.status === "completed") {
          controller.markMutated(sid);
        }
        if (tool === "execute" && e?.status === "completed") {
          controller.markMutated(sid);
        }
        const txt = JSON.stringify(e?.result ?? "");
        if (/\bBLOCKED\b/.test(txt)) controller.markBlocked(sid, true);
      });
    }

    // Berlangganan event compaction, interrupt, dan user message untuk akurasi turnSeq
    if (typeof ctx?.event?.subscribe === "function") {
      void (async () => {
        try {
          for await (const ev of ctx.event.subscribe({
            types: [
              "session.compaction.started",
              "session.compaction.completed",
              "session.compaction.failed",
              "session.execution.interrupted",
              "session.message.created",
              "message.created",
            ],
          })) {
            const sid = ev?.data?.sessionID ?? ev?.sessionID;
            if (typeof sid !== "string") continue;
            if (ev?.type === "session.compaction.started") controller.onCompactionStarted(sid);
            else if (ev?.type === "session.compaction.completed" || ev?.type === "session.compaction.failed") {
              controller.onCompactionFinished(sid);
            } else if (ev?.type === "session.execution.interrupted") {
              controller.markInterrupted(sid, true);
            } else if (ev?.type === "session.message.created" || ev?.type === "message.created") {
              const role = ev?.data?.role ?? ev?.data?.info?.role;
              const meta = ev?.data?.metadata ?? ev?.data?.info?.metadata;
              if (role === "user") {
                controller.onUserInput(sid, {
                  isSynthetic: Boolean(ev?.data?.synthetic || meta?.lumitomeRedrive),
                  metadata: meta,
                });
              }
            }
          }
        } catch {
          // langganan event putus tidak menjatuhkan plugin
        }
      })();
    }

    // Daftarkan hook experimental.idle melalui adapter aman (graceful di 2.3.0)
    await registerExperimentalHook(
      ctx,
      "experimental.idle",
      async (event: any) => {
        const sessionID = event?.sessionID;
        if (typeof sessionID !== "string") return;
        let snapshot: Record<string, unknown> = {};
        try {
          const rows = readJournalRows(env.LUMI_JOURNAL || "");
          const dg = guardMod?.doneGateFromJournal ? guardMod.doneGateFromJournal(rows) : { ran: 0, wrote: false, bgPending: 0 };
          let hasValidWitness = false;
          let staleWitness = false;
          let featuresAllPass = true;
          let hasUnsettledFeatures = false;
          if (witnessMod) {
            const sDir = witnessMod.sessionDirFor(ws, sessionID);
            const inv = witnessMod.invalidateStaleWitnesses({ sessionDir: sDir, workspace: ws });
            const wsList = inv.witnesses || [];
            const validList = wsList.filter((w: any) => w.status === "VALID" && w.exit_code === 0 && !w.masked_exit && !w.output_failed);
            const lastStale = wsList.map((w: any) => w.status).lastIndexOf("STALE");
            hasValidWitness = validList.length > 0 && (lastStale < 0 || wsList.slice(lastStale + 1).some((w: any) => w.status === "VALID" && w.exit_code === 0));
            staleWitness = lastStale >= 0 && !wsList.slice(lastStale + 1).some((w: any) => w.status === "VALID" && w.exit_code === 0);
            const feats = inv.features?.features || [];
            if (feats.length > 0) {
              featuresAllPass = feats.every((f: any) => f.passes === true && f.status === "PASS");
              hasUnsettledFeatures = !featuresAllPass;
            }
          }
          snapshot = {
            wrote: Boolean(dg.wrote),
            gitDiffNonEmpty: hasGitDiff(ws),
            ran: dg.ran ?? 0,
            lastExit: dg.last?.exit,
            maskedExit: Boolean(dg.last?.why && /disamarkan/i.test(dg.last.why)),
            bgPending: dg.bgPending ?? 0,
            hasValidWitness,
            staleWitness,
            featuresAllPass,
            hasUnsettledFeatures,
          };
        } catch {
          snapshot = { stateError: true };
        }
        await controller.handleIdle({
          sessionID,
          background: event?.background ?? [],
          snapshot,
          ctx,
        });
      },
      { home },
    );
  },
};
