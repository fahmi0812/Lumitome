// tui.tsx — bagian TUI plugin /subagent (v0.3.63; v0.3.65: peran selalu aktif
// + model sesi ikut Thinking saat disimpan).
// `/subagent` didaftarkan sebagai slash command lewat keymap.layer; run-nya
// LANGSUNG membuka dialog TANPA melibatkan model — popup muncul deterministik
// (inilah yang gagal di Tahap 1 v0.3.61/62: file .md hanya template prompt,
// model flash tidak memanggil tool `question`, isi file tercetak mentah).
//
// Alur:
//   Stage A (default, dijamin docs): dialog.select() berurutan — model per
//     peran → mode. Keempat peran SELALU aktif (Thinking, Search, Build,
//     Review); tidak ada lagi pertanyaan/toggle aktif-nonaktif per peran.
//     Bila daftar model hanya satu, atau daftar live tidak bisa dibaca,
//     pertanyaan model dilewati (model lama dipertahankan, bukan ditimpa
//     fallback).
//   Stage B (`/subagent tabel`): tabel satu-layar peran × model via dialog
//     JSX kustom (dialog.show, size large) + navigasi keyboard sendiri.
//     Enter = ganti model/mode (dialog.select bersarang), Ctrl+S = simpan,
//     Esc = batal. Checkbox [✓] di tiap baris hanya penanda visual bahwa
//     peran itu aktif (selalu tercentang — Spasi TIDAK menonaktifkan peran).
//   `/subagent off|on|status` ditangani di sini (tanpa popup).
//   Sesudah simpan, MODEL SESI langsung beralih ke model peran Thinking
//   (session.switchModel — mekanisme yang sama dipakai /models; terverifikasi
//   ke sumber opencode v2.3.0 + v2.2.4), lalu prompt delegasi dikirim ke sesi
//   lewat session.prompt (fire-and-forget; model PERAN berlaku mulai sesi TUI
//   berikutnya — jujur di toast). Bila belum ada sesi saat menyimpan (home
//   screen), sesi baru yang dibuat sesudah itu otomatis dialihkan ke Thinking
//   oleh server plugin (index.ts, langganan session.created) — jadi status
//   line menunjukkan Thinking sejak pesan pertama.
//   v0.3.66: sesudah simpan ada SATU pilihan akhir — "Masuk mode subagent
//   sekarang?" [Ya, mulai] langsung masuk mode subagent (sesi aktif dialihkan
//   ke Thinking; bila belum ada sesi, sesi baru DIBUKA dengan model Thinking
//   lalu TUI diarahkan ke sana), [Simpan saja] hanya menyimpan konfigurasi.
//   v0.3.66 juga: model default sesi TUI ikut preset Thinking (wrapper
//   lumitome.mjs) — akar bug live v0.3.65: TUI menimpa switchModel watcher
//   dengan model default config (gemini) saat pesan pertama dikirim.
import { Plugin, usePlugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import { SubagentRpc } from "./rpc.js"
import {
  ROLES,
  ROLE_LABELS,
  ROLE_TIERS,
  ROLE_DESC,
  DEFAULT_MODEL,
  parseSubagentArgs,
  filterNineRouterModels,
  isEnabled,
  buildPreset,
  summarizePreset,
  tableState,
  TABLE_ROWS,
  moveFocus,
  applyTableModel,
  callRpcWithRetry,
  splitModelId,
  thinkingSessionModel,
} from "./flow.mjs"
import { buildDelegationPrompt } from "./prompt.mjs"

function toast(context, title, message, variant) {
  context.ui.toast.show({ title, message, variant: variant ?? "info", duration: 9000 })
}

function toastCancelled(context) {
  toast(context, "Dibatalkan", "Tidak ada perubahan.")
}

/** ID sesi aktif saat ini (undefined bila belum ada sesi — mis. layar awal). */
function currentSessionID(context) {
  const route = context.ui.router.current()
  return route && route.type === "session" && typeof route.sessionID === "string" ? route.sessionID : undefined
}

/**
 * Alihkan model SESI ke model peran Thinking (v0.3.65 — jawaban atas laporan
 * Fahmi: status line TUI menampilkan model SESI (orchestrator), bukan model
 * peran; sesudah save dari popup, sesi harus memakai model Thinking yang
 * dipilih user. Memakai `session.switchModel` — endpoint resmi yang sama
 * dipakai /models (POST /api/session/:id/model; ada di client 2.3.0 dan
 * 2.2.4). Kegagalan TIDAK menggagalkan save (preset sudah tersimpan) —
 * kembalikan catatan jujur untuk toast.
 */
async function switchSessionToThinking(context, preset) {
  const full = thinkingSessionModel(preset)
  if (!full) return { switched: false, note: "Model sesi tidak diubah (Thinking nonaktif)." }
  const sessionID = currentSessionID(context)
  if (!sessionID) return { switched: false, note: "Tidak ada sesi aktif — sesi baru nanti otomatis pakai model Thinking." }
  const parts = splitModelId(full)
  if (!parts) return { switched: false, note: "Model sesi tidak diubah (model Thinking tidak valid)." }
  try {
    await context.client.session.switchModel({ sessionID, model: { providerID: parts.providerID, id: parts.id } })
    return { switched: true, note: `Model sesi kini ${full} (Thinking).` }
  } catch (e) {
    return { switched: false, note: `Model sesi gagal dialihkan (${String(e?.message ?? e)}) — preset tetap tersimpan; ganti manual via /models.` }
  }
}

async function sendDelegationPrompt(context, preset, live, task, sessionIDOverride) {
  const sessionID = sessionIDOverride ?? currentSessionID(context)
  if (!sessionID) {
    toast(context, "Tidak ada sesi aktif", "Konfigurasi tersimpan — delegasi menunggu sesi.")
    return
  }
  const text = buildDelegationPrompt(preset, task, live)
  // Bentuk resmi opencode 2.3.0 + 2.2.4: session.prompt({ sessionID, text })
  // (SessionPromptInput — tidak ada field `parts`; bentuk v0.3.63 dengan
  // `parts: [{ type: "text", text }]` gagal live: "Missing key at ["text"]".)
  context.client.session.prompt({ sessionID, text }).catch((e) => {
    toast(context, "Gagal mengirim ke sesi", String(e?.message ?? e), "error")
  })
}

/**
 * Masuk mode subagent SEKARANG (v0.3.66 — pilihan akhir sesudah simpan):
 * sesi (baru atau yang aktif) langsung pakai model Thinking + prompt
 * delegasi dikirim — user tidak perlu ketik pesan dulu atau restart TUI.
 * Bila belum ada sesi: sesi baru DIBUKA di sini (client.session.create
 * dengan model Thinking) lalu TUI diarahkan ke sesi itu (router.navigate);
 * watcher server plugin melewatinya (model awal sudah Thinking, bukan
 * default terpin). Gagal di langkah mana pun → kembalikan catatan jujur
 * (preset sudah tersimpan; user bisa buka sesi manual).
 */
async function enterSubagentMode(context, preset, live, task) {
  const full = thinkingSessionModel(preset)
  if (!full) return "Model sesi tidak diubah (Thinking nonaktif)."
  const parts = splitModelId(full)
  if (!parts) return "Model sesi tidak diubah (model Thinking tidak valid)."
  let sessionID = currentSessionID(context)
  if (sessionID) {
    try {
      await context.client.session.switchModel({ sessionID, model: { providerID: parts.providerID, id: parts.id } })
    } catch (e) {
      return `Model sesi gagal dialihkan (${String(e?.message ?? e)}) — preset tetap tersimpan; ganti manual via /models.`
    }
  } else {
    try {
      const created = await context.client.session.create({ model: { providerID: parts.providerID, id: parts.id }, agent: "orchestrator" })
      sessionID = created?.id ?? created?.sessionID ?? created?.data?.id
      if (!sessionID) return "Sesi baru gagal dibuat (tidak ada ID) — konfigurasi tersimpan; buka sesi baru manual."
      if (typeof context.ui.router?.navigate === "function") {
        try { context.ui.router.navigate({ type: "session", sessionID }) } catch {}
      }
    } catch (e) {
      return `Sesi baru gagal dibuat (${String(e?.message ?? e)}) — konfigurasi tersimpan; buka sesi baru manual.`
    }
  }
  await sendDelegationPrompt(context, preset, live, task, sessionID)
  return `Sesi memakai ${full} (Thinking).`
}

async function saveAndDelegate(context, rpc, next, live, task) {
  let saved
  try {
    saved = await rpc.savePreset({ preset: next })
  } catch (e) {
    toast(context, "Gagal menyimpan preset", String(e?.message ?? e), "error")
    return
  }
  const warn = saved.warnings?.length ? ` ${saved.warnings.join(" ")}` : ""
  // v0.3.66: langkah akhir — SATU pilihan, bahasa pendek (ide Fahmi: jangan
  // paksa user "buka sesi dulu, baru /subagent, baru Ctrl+S"). Esc/batal =
  // "Simpan saja" (tidak ada yang rusak; konfigurasi sudah tersimpan).
  const choice = await context.ui.dialog.select({
    title: "Masuk mode subagent sekarang?",
    current: "start",
    options: [
      { title: "Ya, mulai", value: "start", description: "Sesi langsung pakai model Thinking" },
      { title: "Simpan saja", value: "save", description: "Cuma simpan konfigurasi" },
    ],
  }).catch(() => undefined)
  if (choice === "start") {
    const note = await enterSubagentMode(context, next, live, task)
    toast(context, "Mode subagent jalan", `${summarizePreset(next)} — ${note}${warn}`)
    return
  }
  const switched = await switchSessionToThinking(context, next)
  toast(
    context,
    "Subagent disimpan",
    `${summarizePreset(next)} — ${switched.note} Model peran berlaku mulai sesi TUI berikutnya.${warn}`,
  )
  await sendDelegationPrompt(context, next, live, task)
}

/** Model per peran yang aman dipakai (model tersimpan yang bukan 9router → fallback terpin). */
function safeModels(preset) {
  const out = {}
  for (const r of ROLES) {
    const stored = preset.roles?.[r]?.model
    out[r] = typeof stored === "string" && stored.startsWith("9router/") ? stored : DEFAULT_MODEL
  }
  return out
}

async function runSelects(context, rpc, preset, models, live, task) {
  // v0.3.65: keempat peran SELALU aktif — langsung tanya model per peran.
  const byRole = safeModels(preset)
  if (live && models.length > 1) {
    for (const role of ROLES) {
      const m = await context.ui.dialog.select({
        title: `Model — ${ROLE_LABELS[role]} (tier ${ROLE_TIERS[role]})`,
        current: models.includes(byRole[role]) ? byRole[role] : models[0],
        options: models.map((id) => ({ title: id, value: id, description: `Tier ${ROLE_TIERS[role]} — ${ROLE_DESC[role]}` })),
      })
      if (m === undefined) return toastCancelled(context)
      byRole[role] = m
    }
  }
  const mode = await context.ui.dialog.select({
    title: "Mode delegasi",
    current: preset.mode === "paralel" ? "paralel" : "serial",
    options: [
      { title: "Serial", value: "serial", description: "Satu peran selesai, baru peran berikut" },
      { title: "Paralel (maks 3)", value: "paralel", description: "Peran jalan bersamaan" },
    ],
  })
  if (mode === undefined) return toastCancelled(context)
  const next = buildPreset(preset, { models: byRole, mode })
  await saveAndDelegate(context, rpc, next, live, task)
}

function showTableOnce(context, state, focus, models) {
  return new Promise((resolve) => {
    context.ui.dialog.set({ size: "large", centered: true })
    context.ui.dialog.show(
      () => <SubagentTable initial={state} focus={focus} models={models} onAction={resolve} />,
      () => resolve({ type: "cancel", focus }),
    )
  })
}

async function runTable(context, rpc, preset, models, live, task) {
  let state = tableState(preset)
  let focus = 0
  while (true) {
    const action = await showTableOnce(context, state, focus, models)
    if (action.type === "cancel") return toastCancelled(context)
    if (action.type === "save") {
      const next = buildPreset(preset, { models: action.state.models, mode: action.state.mode })
      await saveAndDelegate(context, rpc, next, live, task)
      return
    }
    if (action.type === "model") {
      if (!live) {
        toast(context, "Daftar model tidak bisa dibaca", "Model per peran dipertahankan (server 9router tidak merespons).")
        focus = action.focus
        continue
      }
      const m = await context.ui.dialog.select({
        title: `Model — ${ROLE_LABELS[action.role]} (tier ${ROLE_TIERS[action.role]})`,
        current: models.includes(state.models[action.role]) ? state.models[action.role] : models[0],
        options: models.map((id) => ({ title: id, value: id, description: `Tier ${ROLE_TIERS[action.role]}` })),
      })
      if (m !== undefined) state = applyTableModel(state, action.role, m)
      focus = action.focus
      continue
    }
    if (action.type === "mode") {
      const m = await context.ui.dialog.select({
        title: "Mode delegasi",
        current: state.mode,
        options: [
          { title: "Serial", value: "serial", description: "Satu peran selesai, baru peran berikut" },
          { title: "Paralel (maks 3)", value: "paralel", description: "Peran jalan bersamaan" },
        ],
      })
      if (m !== undefined) state = { ...state, mode: m }
      focus = action.focus
      continue
    }
  }
}

/** Tabel satu-layar peran × model (Stage B). State hidup di Solid signal
 *  supaya panah keyboard merender ulang sorotan langsung; hasil akhir
 *  dikirim keluar lewat onAction (save/cancel/model/mode). */
function SubagentTable(props) {
  const plugin = usePlugin()
  const theme = plugin.theme
  const [focus, setFocus] = createSignal(props.focus)
  const [models, setModels] = createSignal({ ...props.initial.models })
  const [mode, setMode] = createSignal(props.initial.mode)
  const snapshot = () => ({ models: models(), mode: mode() })
  const close = (action) => {
    // URUTAN PENTING (bug v0.3.63, ketemu saat uji live Stage B v0.3.65):
    // onAction dulu, baru dialog.clear(). clear() memicu on-close dialog
    // (showTableOnce: resolve "cancel") — bila clear() duluan, "cancel"
    // menang atas "save" dan Ctrl+S selalu berakhir "Dibatalkan" tanpa
    // menyimpan apa pun. Dengan onAction duluan, promise sudah settle
    // dengan aksi yang dimaksud sebelum on-close dipanggil.
    props.onAction(action)
    plugin.ui.dialog.clear()
  }
  plugin.keymap.layer(() => ({
    mode: "global",
    priority: 10,
    commands: [
      { id: "subagent-table-up", bind: "up", run: () => setFocus((f) => moveFocus(f, -1)) },
      { id: "subagent-table-down", bind: "down", run: () => setFocus((f) => moveFocus(f, 1)) },
      {
        id: "subagent-table-enter",
        bind: "return",
        run: () => {
          const row = TABLE_ROWS[focus()]
          if (row === "mode") return props.onAction({ type: "mode", state: snapshot(), focus: focus() })
          props.onAction({ type: "model", role: row, state: snapshot(), focus: focus() })
        },
      },
      { id: "subagent-table-save", bind: "ctrl+s", run: () => close({ type: "save", state: snapshot(), focus: focus() }) },
      { id: "subagent-table-esc", bind: "escape", run: () => close({ type: "cancel", focus: focus() }) },
    ],
  }))
  return (
    <box flexDirection="column" gap={1} padding={1}>
      <text fg={theme.text.accent}>Subagent — peran × model (9router)</text>
      <box flexDirection="column">
        {TABLE_ROWS.map((row, i) => {
          const isMode = row === "mode"
          const label = isMode ? "Mode" : ROLE_LABELS[row]
          const mid = isMode ? mode() : "[✓]"
          const right = isMode ? mode() : models()[row]
          const hint = isMode ? "serial/paralel" : `tier ${ROLE_TIERS[row]}`
          const focused = i === focus()
          return (
            <box flexDirection="row">
              <text fg={focused ? theme.text.accent : theme.text.muted}>{focused ? "❯ " : "  "}</text>
              <text fg={focused ? theme.text.accent : theme.text.base}>{`${label.padEnd(9)} ${mid.padEnd(4)} ${right}  (${hint})`}</text>
            </box>
          )
        })}
      </box>
      <text fg={theme.text.muted}>↑↓ pindah • Enter ganti • Ctrl+S simpan • Esc batal</text>
      <text fg={theme.text.muted}>Model sesi ikut Thinking saat disimpan.</text>
    </box>
  )
}

async function run(context, input) {
  try {
    const rpc = context.client.rpc(SubagentRpc)
    const { command, task } = parseSubagentArgs(input)
    // Aturan keras: OFF = jangan delegasi ke agent peran apa pun; orchestrator
    // bekerja seperti biasa tanpa delegasi peran (dinyalakan lagi via /subagent on).
    if (command === "off" || command === "on") {
      const enabled = command === "on"
      await callRpcWithRetry("setEnabled", () => rpc.setEnabled({ enabled }))
      toast(context, enabled ? "Subagent ON" : "Subagent OFF", enabled ? "Dinyalakan." : "Dimatikan.")
      return
    }
    if (command === "status") {
      const { preset } = await callRpcWithRetry("getPreset", () => rpc.getPreset({}))
      toast(context, `Subagent: ${isEnabled(preset) ? "ON" : "OFF"}`, summarizePreset(preset))
      return
    }
    const { preset } = await callRpcWithRetry("getPreset", () => rpc.getPreset({}))
    if (!isEnabled(preset)) {
      toast(context, "Subagent OFF", "Sistem /subagent sedang OFF — peran tidak aktif. Panggil /subagent on untuk menyalakannya.")
      return
    }
    const live = await callRpcWithRetry("getLiveModels", () => rpc.getLiveModels({}))
    const models = filterNineRouterModels(live.models)
    if (command === "tabel") {
      await runTable(context, rpc, preset, models, live.live, task)
      return
    }
    await runSelects(context, rpc, preset, models, live.live, task)
  } catch (e) {
    toast(context, "Subagent gagal", String(e?.message ?? e), "error")
  }
}

export default Plugin.define({
  id: "lumitome.subagent.tui",
  setup(context) {
    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: "lumitome.subagent",
          title: "Subagent roles",
          group: "Lumitome",
          palette: true,
          slash: { name: "subagent", aliases: [], arguments: true },
          enabled: () => true,
          run: async (input) => {
            await run(context, input)
          },
        },
      ],
    }))
  },
})
