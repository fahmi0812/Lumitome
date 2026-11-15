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
  DEFAULT_MODEL,
} from "../../../../scripts/apply-subagent-preset.mjs"
import { resolveRepoRoot, presetPath } from "./paths.mjs"
import { filterNineRouterModels, canSavePreset } from "./flow.mjs"

function readPreset(root: string) {
  return JSON.parse(fs.readFileSync(presetPath(root), "utf8"))
}

export default Plugin.define({
  id: "lumitome.subagent",
  async setup(ctx) {
    const root = resolveRepoRoot(fileURLToPath(import.meta.url))
    ctx.rpc.register(SubagentRpc, {
      getPreset: async () => ({ preset: readPreset(root) }),
      getLiveModels: async () => {
        const live = loadLiveModels()
        if (!live) return { models: [DEFAULT_MODEL], live: false }
        return { models: filterNineRouterModels(live.map((m) => `9router/${m}`)), live: true }
      },
      savePreset: async (input, context) => {
        const preset = input.preset
        const guard = canSavePreset(readPreset(root), preset)
        if (!guard.ok) {
          return context.error("invalid_preset", guard.reason, { errors: [guard.reason] })
        }
        const live = loadLiveModels()
        const { errors, warnings } = validatePreset(preset, live)
        if (errors.length) {
          return context.error("invalid_preset", errors.join("; "), { errors })
        }
        fs.writeFileSync(presetPath(root), JSON.stringify(preset, null, 2) + "\n")
        const applied = applyPreset({ root, preset, liveModels: live })
        if (applied.errors.length) {
          return context.error("invalid_preset", applied.errors.join("; "), { errors: applied.errors })
        }
        return { ok: true, applied: true, warnings: [...new Set([...warnings, ...applied.warnings])] }
      },
      setEnabled: async (input) => {
        const preset = readPreset(root)
        const next = setEnabled(preset, input.enabled === true)
        fs.writeFileSync(presetPath(root), JSON.stringify(next, null, 2) + "\n")
        return { enabled: next.enabled }
      },
    })
  },
})
