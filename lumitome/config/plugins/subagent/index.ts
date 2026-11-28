// index.ts — bagian server plugin /subagent (v0.3.63).
// Mendaftarkan RPC lumitome.subagent: baca/tulis preset + daftar model
// 9router live, memakai ulang scripts/apply-subagent-preset.mjs (jangan
// tulis ulang validasi 9router-only). Root repo diselesaikan dari lokasi
// file ini (paths.mjs) — BUKAN dari ctx.location.directory (itu direktori
// proyek pengguna; preset + agent hidup di root repo Lumitome).
// v0.3.70: penegakan delegasi NATIVE di kode plugin (riset Claude Code):
// context hook menghapus direct tools dari snapshot orchestrator + injeksi
// protokol delegasi pendek tiap model call; guard execute.before menolak
// tool mutasi + memvalidasi panggilan subagent; execute.after mencatat
// metrik delegation-rate (JSONL); audit akhir giliran via event
// session.execution.*. TIDAK ada re-drive (engine tidak punya hook
// Stop/SubagentStop pemblokir — lihat CHANGELOG v0.3.70).
import { Plugin } from "@opencode/plugin"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { SubagentRpc } from "./rpc.js"
import { DEFAULT_MODEL } from "../../../lib/default-model.mjs";
import {
  applyPreset,
  validatePreset,
  loadLiveModels,
  setEnabled,
  syncOrchestratorMode,
  syncSubagentRulesConfig,
  syncOrchestratorPermissions,
} from "../../../../scripts/apply-subagent-preset.mjs"
import { resolveRepoRoot } from "./paths.mjs"
import { loadPreset, saveUserPreset } from "../../../lib/subagent-preset.mjs"
import {
  filterNineRouterModels,
  canSavePreset,
  thinkingSessionModel,
  childSessionModel,
  splitModelId,
  ROLES,
} from "./flow.mjs"
import {
  ORCHESTRATOR_AGENT,
  shouldEnforce,
  applyToolEnforcement,
  buildDelegationProtocol,
  subagentToolDescription,
  guardToolCall,
  classifyTool,
  appendMetrics,
  lumiHome,
  newCounters,
  countTool,
  turnDelta,
  evaluateDelegationViolation,
  debugEnabled,
} from "./enforce.mjs"
import { registerExperimentalHook } from "../lib/experimental-adapter.mjs"
import { IdleGateController } from "../lib/idle-gate-core.mjs"
import { buildReviewerContextPrompt } from "./prompt.mjs"

// v0.3.71 (A1): preset dibaca dari file user $LUMI_HOME (migrasi dari
// seed repo bila belum ada; fallback seed bila file user hilang/rusak).
// `home` disuntik dari setup (lumiHome) supaya tes bisa memakai home lain.
function readPreset(root: string, home?: string) {
  return loadPreset({ home: home ?? lumiHome(), root }).preset
}

function readPresetSafe(root: string, home?: string) {
  try {
    return readPreset(root, home)
  } catch {
    return null
  }
}

// Model awal sesi dari event (provider/id) — bila event tidak membawa
// model, dicek ulang via session.get; tidak diketahui → null (jangan menebak).
async function initialModel(ctx: any, data: any) {
  if (data?.model?.providerID && data?.model?.id) {
    return `${data.model.providerID}/${data.model.id}`
  }
  try {
    const info = await ctx.session.get({ sessionID: data.sessionID })
    return info?.model?.providerID && info?.model?.id
      ? `${info.model.providerID}/${info.model.id}`
      : null
  } catch {
    return null // model awal tidak diketahui: jangan menebak
  }
}

async function switchSessionModel(ctx: any, sessionID: string, target: string) {
  const parts = splitModelId(target)
  if (!parts) return false
  await ctx.session.switchModel({
    sessionID,
    model: { providerID: parts.providerID, id: parts.id },
  })
  return true
}

// Sesi baru lahir dengan model default terpin → alihkan ke model Thinking.
// (v0.3.65: menutup celah "save di home screen" — di home belum ada sesi,
// jadi switch saat save tidak punya sasaran; sesi pertama yang dibuat
// sesudah itu tetap lahir dengan gemini. Watcher ini memastikan sesi baru
// pun langsung memakai Thinking, jadi status line menunjukkan model yang
// dipilih Fahmi sejak pesan pertama.)
// Pengaman, semuanya harus lolos sebelum switch (sesi utama):
//  - agent bukan orchestrator JANGAN disentuh;
//  - pilihan model eksplisit dihormati: hanya sesi yang lahir dengan model
//    default terpin (atau tanpa model di event — dicek ulang via session.get)
//    yang dialihkan, jadi `lumitome run -m <model>` / LUMI_MODEL tetap menang;
//  - /subagent off (enabled: false) → tidak ada pengalihan;
//  - Thinking nonaktif / bukan 9router → tidak ada pengalihan.
//
// v0.3.76 (LEAK #1/A): sesi ANAK peran JUGA dialihkan — ke
// preset.roles[agent].model (bukan ke Thinking). Daemon memuat file agent
// sekali saat boot, jadi anak yang lahir sesudah preset disimpan lewat
// popup di tengah sesi tetap memakai model basi dari cache daemon bila
// tidak dialihkan di sini. Anak non-peran (agent bukan peran) tidak
// disentuh. switchModel pada anak bisa gagal/terlambat (balapan dengan
// giliran pertama anak) — kegagalan dicatat ke metrik (child-switch-failed),
// bukan dilempar; bila API tidak mengizinkan sama sekali, perbaikan B
// (fingerprint daemon) yang menanggung — lihat CHANGELOG v0.3.76.
async function maybeSwitchNewSession(ctx: any, root: string, home: string, event: any) {
  if (event?.type !== "session.created") return
  const data = event.data ?? {}
  if (!data.sessionID) return
  const preset = readPresetSafe(root, home)
  if (!preset || preset.enabled === false) return
  if (data.parentID) {
    const agent = data.agent
    if (typeof agent !== "string" || !ROLES.includes(agent)) return
    const initial = await initialModel(ctx, data)
    const target = childSessionModel(preset, agent, initial)
    if (!target) return
    try {
      if (await switchSessionModel(ctx, data.sessionID, target)) {
        appendMetrics(home, { kind: "child-switch", sessionID: data.sessionID, parentID: data.parentID, agent, from: initial, to: target })
      }
    } catch (e) {
      appendMetrics(home, { kind: "child-switch-failed", sessionID: data.sessionID, parentID: data.parentID, agent, from: initial, to: target, error: String((e as any)?.message ?? e) })
    }
    return
  }
  if (data.agent && data.agent !== "orchestrator") return
  const initial = await initialModel(ctx, data)
  if (initial && initial !== DEFAULT_MODEL) return
  const thinking = thinkingSessionModel(preset)
  if (!thinking || thinking === initial) return
  await switchSessionModel(ctx, data.sessionID, thinking)
}

function watchSessionCreated(ctx: any, root: string, home: string, sessionAgents: Map<string, string>) {
  // Fire-and-forget + fail-silent: pengalihan sesi baru tidak boleh
  // mematikan plugin bila langganan event putus. Peta sessionID → agent
  // juga dipakai guard execute.before + audit akhir giliran (v0.3.70) —
  // event session.created membawa agent (dipakai watcher sejak v0.3.65).
  void (async () => {
    try {
      for await (const event of ctx.event.subscribe({ types: ["session.created"] })) {
        try {
          if (typeof event?.data?.sessionID === "string" && typeof event?.data?.agent === "string") {
            sessionAgents.set(event.data.sessionID, event.data.agent)
          }
          // v0.3.76 (LEAK #5/E): catat kelahiran sesi anak (peran + model
          // awal) — tanpa ini metrik buta terhadap kebocoran model anak.
          if (typeof event?.data?.sessionID === "string" && typeof event?.data?.parentID === "string") {
            const m = event.data.model?.providerID && event.data.model?.id
              ? `${event.data.model.providerID}/${event.data.model.id}`
              : null
            appendMetrics(home, { kind: "child-session", sessionID: event.data.sessionID, parentID: event.data.parentID, agent: event.data.agent ?? null, model: m })
          }
          await maybeSwitchNewSession(ctx, root, home, event)
        } catch {
          // satu sesi gagal dialihkan: lanjut ke event berikutnya
        }
      }
    } catch {
      // langganan putus: diam (RPC plugin tetap jalan)
    }
  })()
}

// Audit akhir giliran (v0.3.70 — bagian pengukuran peringkat 5 riset, TANPA
// re-drive): tiap session.execution.* di sesi orchestrator (mode ON) dicatat
// delta tool call sejak audit terakhir ke metrik JSONL. Giliran dengan
// delta.subagent === 0 = orchestrator selesai tanpa delegasi — tercatat,
// bukan dipaksa ulang (engine tidak punya hook Stop pemblokir; re-prompt
// via event berpacu dengan input user dan bisa loop).
function watchExecutionEnds(ctx: any, root: string, home: string, sessionAgents: Map<string, string>, countersBySession: Map<string, any>) {
  void (async () => {
    try {
      for await (const event of ctx.event.subscribe({ types: ["session.execution.succeeded", "session.execution.failed", "session.execution.interrupted"] })) {
        try {
          const sessionID = event?.data?.sessionID
          if (typeof sessionID !== "string") continue
          const agent = sessionAgents.get(sessionID)
          const preset = readPresetSafe(root, home)
          if (!shouldEnforce(preset, agent)) continue
          const counters = countersBySession.get(sessionID)
          if (!counters) continue
          const delta = turnDelta(counters)
          const outcome = String(event?.type ?? "").replace("session.execution.", "")
          appendMetrics(home, { kind: "turn-end", sessionID, agent, outcome, ...delta, delegated: delta.subagent > 0 })
        } catch {
          // satu audit gagal: lanjut ke event berikutnya
        }
      }
    } catch {
      // langganan putus: diam (metrik saja yang hilang)
    }
  })()
}

// Penegakan delegasi native (v0.3.70). Tiga hook, semuanya fail-silent +
// dijaga kapabilitas engine (engine lama tanpa hook ini dilewati diam-diam):
//  - context: hapus direct tools dari snapshot orchestrator + injeksi
//    protokol delegasi pendek + pertajam deskripsi tool subagent.
//  - execute.before: guard — tolak tool mutasi + validasi panggilan
//    subagent (throw; spike-test live membuktikan throw memblokir).
//  - execute.after: hitung tool call per sesi → metrik JSONL.
// Agent untuk guard diambil dari event (bila ada) → peta session.created
// → ctx.session.get; bila tetap tidak diketahui, guard MEMBIARKAN lewat
// (fail-open — sesi bukan orchestrator tidak boleh terblokir; penghapusan
// tool di context hook tetap berlaku karena hook itu membawa event.agent).
async function registerEnforcement(ctx: any, root: string, home: string, sessionAgents: Map<string, string>, countersBySession: Map<string, any>) {
  const debug = debugEnabled()
  let reviewerCtxMod: any = null
  try {
    reviewerCtxMod = await import(pathToFileURL(path.join(root, "harness", "reviewer-context.mjs")).href)
  } catch {
    reviewerCtxMod = null
  }
  if (typeof ctx.session?.hook === "function") {
    const idleController = new IdleGateController({ lumiHome: home })
    await registerExperimentalHook(
      ctx,
      "experimental.idle",
      async (event: any) => {
        try {
          const sessionID = event?.sessionID
          if (typeof sessionID !== "string") return
          const agent = sessionAgents.get(sessionID)
          const preset = readPresetSafe(root, home)
          const counters = countersBySession.get(sessionID)
          const check = evaluateDelegationViolation(counters, preset, agent)
          if (!check.violation) return
          const res = await idleController.handleIdle({
            sessionID,
            background: event?.background ?? [],
            snapshot: { delegationViolation: true },
            ctx,
          })
          appendMetrics(home, { kind: "idle-redrive", sessionID, agent, action: res.action, reason: res.reason ?? "DELEGATION_BYPASS", attempt: res.attempt ?? 0 })
        } catch {
          // audit/re-drive fail-silent
        }
      },
      { home },
    )
    await ctx.session.hook("context", (event: any) => {
      try {
        const preset = readPresetSafe(root, home)
        if (!shouldEnforce(preset, event?.agent)) return
        if (event?.tools && typeof event.tools === "object") {
          const { removed } = applyToolEnforcement(event.tools, preset, event.agent)
          if (event.tools.subagent && typeof event.tools.subagent.description === "string") {
            event.tools.subagent.description = subagentToolDescription(preset, event.tools.subagent.description)
          }
          if (debug) appendMetrics(home, { kind: "debug", hook: "context", sessionID: event?.sessionID, agent: event?.agent, removed })
        }
        if (Array.isArray(event?.system)) {
          event.system.push({ type: "text", text: buildDelegationProtocol(preset) })
        }
        if (debug) appendMetrics(home, { kind: "debug", hook: "context-system", sessionID: event?.sessionID, agent: event?.agent, systemIsArray: Array.isArray(event?.system), systemLen: Array.isArray(event?.system) ? event.system.length : -1 })
      } catch (e) {
        appendMetrics(home, { kind: "hook-error", hook: "context", message: String((e as any)?.message ?? e) })
      }
    })
  }
  if (typeof ctx.tool?.hook === "function") {
    await ctx.tool.hook("execute.before", async (event: any) => {
      const tool = event?.tool
      if (typeof tool !== "string") return
      const sessionID = event?.sessionID
      let agent = event?.agent
      if (typeof agent !== "string" && typeof sessionID === "string") {
        agent = sessionAgents.get(sessionID)
        if (typeof agent !== "string" && typeof ctx.session?.get === "function") {
          try {
            const info = await ctx.session.get({ sessionID })
            agent = info?.agent
            if (typeof agent === "string") sessionAgents.set(sessionID, agent)
          } catch {
            // agent tetap tidak diketahui: guard membiarkan lewat
          }
        }
      }
      if (debug) appendMetrics(home, { kind: "debug", hook: "execute.before", sessionID, agent, tool, keys: Object.keys(event ?? {}) })
      const preset = readPresetSafe(root, home)
      const reason = guardToolCall({ preset, agent, tool, input: event?.input })
      if (reason) {
        const counters = countersBySession.get(sessionID) ?? newCounters()
        countTool(counters, tool, true)
        if (typeof sessionID === "string") countersBySession.set(sessionID, counters)
        appendMetrics(home, { kind: "guard-block", sessionID, agent, tool, reason })
        throw new Error(reason)
      }
      // T2.4: context-stripping deterministik saat delegasi ke reviewer / goldfish
      if (tool === "subagent" && (event?.input?.agent === "reviewer" || event?.input?.agent === "goldfish")) {
        if (event.input && typeof event.input.prompt === "string") {
          const stripped = buildReviewerContextPrompt(event.input.prompt, reviewerCtxMod)
          if (stripped) event.input = { ...event.input, prompt: stripped }
        }
      }
    })
    await ctx.tool.hook("execute.after", (event: any) => {
      try {
        const sessionID = event?.sessionID
        const tool = event?.tool
        if (typeof sessionID !== "string" || typeof tool !== "string") return
        const agent = sessionAgents.get(sessionID)
        const preset = readPresetSafe(root, home)
        if (!shouldEnforce(preset, agent)) return
        const counters = countersBySession.get(sessionID) ?? newCounters()
        countTool(counters, tool, false)
        countersBySession.set(sessionID, counters)
        // v0.3.76 (LEAK #5/E): sertakan peran target panggilan subagent
        // (input.agent) bila ada — tanpa ini metrik tidak tahu peran mana
        // yang dipanggil, hanya bahwa "subagent" dipanggil.
        const targetAgent = typeof event?.input?.agent === "string" ? event.input.agent : undefined
        appendMetrics(home, { kind: "tool", sessionID, agent, tool, toolKind: classifyTool(tool), status: event?.status, ...(targetAgent ? { targetAgent } : {}) })
        if (debug) appendMetrics(home, { kind: "debug", hook: "execute.after", sessionID, agent, tool, status: event?.status, keys: Object.keys(event ?? {}) })
      } catch {
        // metrik tidak boleh mematikan plugin
      }
    })
  }
}

export default Plugin.define({
  id: "lumitome.subagent",
  async setup(ctx) {
    const root = resolveRepoRoot(fileURLToPath(import.meta.url))
    const home = lumiHome()
    // Peta sesi → agent + counter tool call per sesi (v0.3.70: guard + metrik).
    const sessionAgents = new Map<string, string>()
    const countersBySession = new Map<string, any>()
    // Sesi baru otomatis memakai model Thinking (v0.3.65); sesi anak peran
    // otomatis memakai model preset perannya (v0.3.76, LEAK #1/A). Dijaga
    // ketat: hanya bila API plugin menyediakannya (engine lama tanpa
    // ctx.event / ctx.session.switchModel dilewati diam-diam — plugin RPC
    // tetap jalan).
    if (typeof ctx.event?.subscribe === "function" && typeof ctx.session?.switchModel === "function") {
      watchSessionCreated(ctx, root, home, sessionAgents)
      watchExecutionEnds(ctx, root, home, sessionAgents, countersBySession)
    }
    // Penegakan delegasi native (v0.3.70) — dijaga kapabilitas engine.
    try {
      await registerEnforcement(ctx, root, home, sessionAgents, countersBySession)
    } catch {
      // hook tidak tersedia di engine ini: file permissions + RPC tetap jalan
    }
    ctx.rpc.register(SubagentRpc, {
      getPreset: async () => ({ preset: readPreset(root, home) }),
      getLiveModels: async () => {
        const live = loadLiveModels()
        if (!live) return { models: [DEFAULT_MODEL], live: false }
        return { models: filterNineRouterModels(live.map((m) => `9router/${m}`)), live: true }
      },
      savePreset: async (input, context) => {
        const preset = input.preset
        // v0.3.69: `stored` = preset SEBELUM save — model tersimpan yang
        // tidak ada di daftar live saat ini di-grandfather (peringatan,
        // bukan error); tanpa ini dialog yang mempertahankan model tersimpan
        // tetap gagal disimpan (bug H2 lanjutan, terbukti live: toast
        // "Gagal menyimpan preset" untuk model tersimpan).
        const stored = readPreset(root, home)
        const guard = canSavePreset(stored, preset)
        if (!guard.ok) {
          return context.error("invalid_preset", guard.reason, { errors: [guard.reason] })
        }
        const live = loadLiveModels()
        const { errors, warnings } = validatePreset(preset, live, stored)
        if (errors.length) {
          return context.error("invalid_preset", errors.join("; "), { errors })
        }
        saveUserPreset({ home, preset })
        const applied = applyPreset({ root, preset, liveModels: live, stored })
        if (applied.errors.length) {
          return context.error("invalid_preset", applied.errors.join("; "), { errors: applied.errors })
        }
        return { ok: true, applied: true, warnings: [...new Set([...warnings, ...applied.warnings])] }
      },
      setEnabled: async (input) => {
        const preset = readPreset(root, home)
        const next = setEnabled(preset, input.enabled === true)
        saveUserPreset({ home, preset: next })
        // v0.3.67: baris mode di orchestrator.md ikut saklar — tanpa ini
        // aturan peran tetap berlaku di sesi baru walau sistem dimatikan.
        // v0.3.68: blok konfigurasi di rules/subagent.md ikut saklar juga
        // (mode OFF tertulis di blok; sesi baru tanpa notice membaca dari file).
        // v0.3.70: permissions orchestrator ikut saklar — OFF mengembalikan
        // edit (perilaku normal penuh), ON menolak edit/shell (hanya delegasi).
        syncOrchestratorMode({ root, preset: next })
        syncSubagentRulesConfig({ root, preset: next })
        syncOrchestratorPermissions({ root, preset: next })
        return { enabled: next.enabled }
      },
    })
  },
})
