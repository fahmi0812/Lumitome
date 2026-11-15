// index.ts — bagian server plugin /subagent (v0.3.63).
// Mendaftarkan RPC lumitome.subagent: baca/tulis preset + daftar model
// 9router live, memakai ulang scripts/apply-subagent-preset.mjs (jangan
// tulis ulang validasi 9router-only). Root repo diselesaikan dari lokasi
// file ini (paths.mjs) — BUKAN dari ctx.location.directory (itu direktori
// proyek pengguna; preset + agent hidup di root repo Lumitome).
import { Plugin } from "@opencode/plugin"
import fs from "node:fs"
import { fileURLToPath } from "node:url"
import { SubagentRpc } from "./rpc.js"
import {
  applyPreset,
  validatePreset,
  loadLiveModels,
  setEnabled,
  syncOrchestratorMode,
  syncSubagentRulesConfig,
  DEFAULT_MODEL,
} from "../../../../scripts/apply-subagent-preset.mjs"
import { resolveRepoRoot, presetPath } from "./paths.mjs"
import {
  filterNineRouterModels,
  canSavePreset,
  thinkingSessionModel,
  splitModelId,
} from "./flow.mjs"

function readPreset(root: string) {
  return JSON.parse(fs.readFileSync(presetPath(root), "utf8"))
}

function readPresetSafe(root: string) {
  try {
    return readPreset(root)
  } catch {
    return null
  }
}

// Sesi baru lahir dengan model default terpin → alihkan ke model Thinking.
// (v0.3.65: menutup celah "save di home screen" — di home belum ada sesi,
// jadi switch saat save tidak punya sasaran; sesi pertama yang dibuat
// sesudah itu tetap lahir dengan gemini. Watcher ini memastikan sesi baru
// pun langsung memakai Thinking, jadi status line menunjukkan model yang
// dipilih Fahmi sejak pesan pertama.)
// Pengaman, semuanya harus lolos sebelum switch:
//  - sesi anak subagent (parentID terisi) JANGAN disentuh — model peran
//    mereka datang dari file agent;
//  - agent bukan orchestrator JANGAN disentuh;
//  - pilihan model eksplisit dihormati: hanya sesi yang lahir dengan model
//    default terpin (atau tanpa model di event — dicek ulang via session.get)
//    yang dialihkan, jadi `lumitome run -m <model>` / LUMI_MODEL tetap menang;
//  - /subagent off (enabled: false) → tidak ada pengalihan;
//  - Thinking nonaktif / bukan 9router → tidak ada pengalihan.
async function maybeSwitchNewSession(ctx: any, root: string, event: any) {
  if (event?.type !== "session.created") return
  const data = event.data ?? {}
  if (!data.sessionID || data.parentID) return
  if (data.agent && data.agent !== "orchestrator") return
  let initial = data.model?.providerID && data.model?.id
    ? `${data.model.providerID}/${data.model.id}`
    : null
  if (!initial) {
    try {
      const info = await ctx.session.get({ sessionID: data.sessionID })
      initial = info?.model?.providerID && info?.model?.id
        ? `${info.model.providerID}/${info.model.id}`
        : null
    } catch {
      return // model awal tidak diketahui: jangan menebak
    }
  }
  if (initial && initial !== DEFAULT_MODEL) return
  const preset = readPresetSafe(root)
  if (!preset || preset.enabled === false) return
  const thinking = thinkingSessionModel(preset)
  if (!thinking || thinking === initial) return
  const parts = splitModelId(thinking)
  if (!parts) return
  await ctx.session.switchModel({
    sessionID: data.sessionID,
    model: { providerID: parts.providerID, id: parts.id },
  })
}

function watchSessionCreated(ctx: any, root: string) {
  // Fire-and-forget + fail-silent: pengalihan sesi baru tidak boleh
  // mematikan plugin bila langganan event putus.
  void (async () => {
    try {
      for await (const event of ctx.event.subscribe({ types: ["session.created"] })) {
        try {
          await maybeSwitchNewSession(ctx, root, event)
        } catch {
          // satu sesi gagal dialihkan: lanjut ke event berikutnya
        }
      }
    } catch {
      // langganan putus: diam (RPC plugin tetap jalan)
    }
  })()
}

export default Plugin.define({
  id: "lumitome.subagent",
  async setup(ctx) {
    const root = resolveRepoRoot(fileURLToPath(import.meta.url))
    // Sesi baru otomatis memakai model Thinking (v0.3.65). Dijaga ketat:
    // hanya bila API plugin menyediakannya (engine lama tanpa ctx.event /
    // ctx.session.switchModel dilewati diam-diam — plugin RPC tetap jalan).
    if (typeof ctx.event?.subscribe === "function" && typeof ctx.session?.switchModel === "function") {
      watchSessionCreated(ctx, root)
    }
    ctx.rpc.register(SubagentRpc, {
      getPreset: async () => ({ preset: readPreset(root) }),
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
        const stored = readPreset(root)
        const guard = canSavePreset(stored, preset)
        if (!guard.ok) {
          return context.error("invalid_preset", guard.reason, { errors: [guard.reason] })
        }
        const live = loadLiveModels()
        const { errors, warnings } = validatePreset(preset, live, stored)
        if (errors.length) {
          return context.error("invalid_preset", errors.join("; "), { errors })
        }
        fs.writeFileSync(presetPath(root), JSON.stringify(preset, null, 2) + "\n")
        const applied = applyPreset({ root, preset, liveModels: live, stored })
        if (applied.errors.length) {
          return context.error("invalid_preset", applied.errors.join("; "), { errors: applied.errors })
        }
        return { ok: true, applied: true, warnings: [...new Set([...warnings, ...applied.warnings])] }
      },
      setEnabled: async (input) => {
        const preset = readPreset(root)
        const next = setEnabled(preset, input.enabled === true)
        fs.writeFileSync(presetPath(root), JSON.stringify(next, null, 2) + "\n")
        // v0.3.67: baris mode di orchestrator.md ikut saklar — tanpa ini
        // aturan peran tetap berlaku di sesi baru walau sistem dimatikan.
        // v0.3.68: blok konfigurasi di rules/subagent.md ikut saklar juga
        // (mode OFF tertulis di blok; sesi baru tanpa notice membaca dari file).
        syncOrchestratorMode({ root, preset: next })
        syncSubagentRulesConfig({ root, preset: next })
        return { enabled: next.enabled }
      },
    })
  },
})
