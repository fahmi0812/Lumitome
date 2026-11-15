// rpc.ts — definisi RPC /subagent (v0.3.63).
// TUI memanggil method ini lewat `context.client.rpc(SubagentRpc)`;
// implementasinya hidup di bagian server (index.ts).
//
// PENTING: skema input/output memakai NILAI CONTOH KONKRET (bukan `{}`),
// mengikuti contoh docs RPC. Nilai `{}` kosong membuat registrasi RPC
// gagal di engine 2.3.0 ("Object.entries requires that input parameter
// not be null or undefined", terverifikasi di log server) sehingga RPC
// tidak tersedia sama sekali.
import { Rpc } from "@opencode/plugin/rpc"

const EXAMPLE_ROLE = { active: true, model: "9router/ag/gemini-3.8-flash-high", tier: "terkuat" }
const EXAMPLE_PRESET = {
  enabled: true,
  mode: "serial",
  roles: { thinking: EXAMPLE_ROLE, search: EXAMPLE_ROLE, builder: EXAMPLE_ROLE, reviewer: EXAMPLE_ROLE },
}

export const SubagentRpc = Rpc.define({
  id: "lumitome.subagent",
  methods: {
    /** Baca preset saat ini (roles + mode + enabled). */
    getPreset: {
      input: {},
      output: { preset: EXAMPLE_PRESET },
    },
    /** Simpan preset hasil dialog (validasi 9router dulu), lalu terapkan ke file agent. */
    savePreset: {
      input: { preset: EXAMPLE_PRESET },
      output: { ok: true, applied: true, warnings: [] },
      errors: {
        invalid_preset: {
          message: "Preset tidak valid (lihat detail)",
        },
      },
    },
    /** Daftar model 9router yang masih hidup (fallback terpin bila server mati). */
    getLiveModels: {
      input: {},
      output: { models: ["9router/ag/gemini-3.8-flash-high"], live: true },
    },
    /** Saklar on/off sistem peran (v0.3.62). */
    setEnabled: {
      input: { enabled: true },
      output: { enabled: true },
    },
  },
})
