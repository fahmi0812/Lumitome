// tui.tsx — bagian TUI plugin /subagent (v0.3.63).
// `/subagent` didaftarkan sebagai slash command lewat keymap.layer; run-nya
// LANGSUNG membuka dialog TANPA melibatkan model — popup muncul deterministik
// (inilah yang gagal di Tahap 1 v0.3.61/62: file .md hanya template prompt,
// model flash tidak memanggil tool `question`, isi file tercetak mentah).
//
// Alur:
//   Stage A (default, dijamin docs): dialog.select() berurutan — peran aktif
//     → model per peran aktif → mode. Bila daftar model hanya satu, atau
//     daftar live tidak bisa dibaca, pertanyaan model dilewati (model lama
//     dipertahankan, bukan ditimpa fallback).
//   Stage B (`/subagent tabel`): tabel satu-layar peran × model via dialog
//     JSX kustom (dialog.show, size large) + navigasi keyboard sendiri.
//     Enter = ganti model/mode (dialog.select bersarang), Spasi = aktif/
//     nonaktif, Ctrl+S = simpan, Esc = batal.
//   `/subagent off|on|status` ditangani di sini (tanpa popup).
//   Sesudah simpan, prompt delegasi dikirim ke sesi lewat session.prompt
//   (fire-and-forget; model berlaku mulai sesi TUI berikutnya — jujur di toast).
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
  allActive,
  buildPreset,
  summarizePreset,
  tableState,
  TABLE_ROWS,
  moveFocus,
  toggleRole,
  applyTableModel,
  callRpcWithRetry,
} from "./flow.mjs"
import { buildDelegationPrompt } from "./prompt.mjs"

function toast(context, title, message, variant) {
  context.ui.toast.show({ title, message, variant: variant ?? "info", duration: 9000 })
}

function toastCancelled(context) {
  toast(context, "Dibatalkan", "Tidak ada perubahan.")
}

async function sendDelegationPrompt(context, preset, live, task) {
  const route = context.ui.router.current()
  const sessionID = route && route.type === "session" && typeof route.sessionID === "string" ? route.sessionID : undefined
  if (!sessionID) {
    toast(context, "Tidak ada sesi aktif", "Konfigurasi tersimpan — delegasi menunggu sesi.")
    return
  }
  const text = buildDelegationPrompt(preset, task, live)
  context.client.session.prompt({ sessionID, parts: [{ type: "text", text }] }).catch((e) => {
    toast(context, "Gagal mengirim ke sesi", String(e?.message ?? e), "error")
  })
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
  toast(
    context,
    "Subagent disimpan",
    `${summarizePreset(next)} — Model berlaku mulai sesi TUI berikutnya; peran + mode berlaku langsung.${warn}`,
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
  const active = {}
  for (const r of ROLES) active[r] = preset.roles?.[r]?.active !== false
  const choice = await context.ui.dialog.select({
    title: "Peran aktif /subagent",
    current: allActive(preset) ? "all" : "custom",
    options: [
      { title: "Semua peran", value: "all", description: "Thinking, Search, Build, Review aktif" },
      { title: "Atur per peran…", value: "custom", description: "Nyalakan/matikan tiap peran satu per satu" },
    ],
  })
  if (choice === undefined) return toastCancelled(context)
  if (choice === "custom") {
    for (const role of ROLES) {
      const v = await context.ui.dialog.select({
        title: `Peran — ${ROLE_LABELS[role]}`,
        current: active[role] ? "on" : "off",
        options: [
          { title: "Aktif", value: "on", description: ROLE_DESC[role] },
          { title: "Nonaktif", value: "off", description: "Peran ini tidak dipakai" },
        ],
      })
      if (v === undefined) return toastCancelled(context)
      active[role] = v === "on"
    }
  }
  if (!ROLES.some((r) => active[r])) {
    toast(context, "Tidak ada peran aktif", "Tidak ada yang disimpan — minimal satu peran harus aktif.")
    return
  }
  const byRole = safeModels(preset)
  if (live && models.length > 1) {
    for (const role of ROLES.filter((r) => active[r])) {
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
  const next = buildPreset(preset, { active, models: byRole, mode })
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
      const next = buildPreset(preset, { active: action.state.active, models: action.state.models, mode: action.state.mode })
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
    if (action.type === "toggle") {
      state = toggleRole(state, action.role)
      focus = action.focus
      continue
    }
  }
}

/** Tabel satu-layar peran × model (Stage B). State hidup di Solid signal
 *  supaya panah keyboard merender ulang sorotan langsung; hasil akhir
 *  dikirim keluar lewat onAction (save/cancel/model/mode/toggle). */
function SubagentTable(props) {
  const plugin = usePlugin()
  const theme = plugin.theme
  const [focus, setFocus] = createSignal(props.focus)
  const [active, setActive] = createSignal({ ...props.initial.active })
  const [models, setModels] = createSignal({ ...props.initial.models })
  const [mode, setMode] = createSignal(props.initial.mode)
  const snapshot = () => ({ active: active(), models: models(), mode: mode() })
  const close = (action) => {
    plugin.ui.dialog.clear()
    props.onAction(action)
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
      {
        id: "subagent-table-space",
        bind: "space",
        run: () => {
          const row = TABLE_ROWS[focus()]
          if (row === "mode") return setMode((m) => (m === "paralel" ? "serial" : "paralel"))
          setActive((a) => ({ ...a, [row]: !a[row] }))
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
          const mid = isMode ? mode() : active()[row] ? "Aktif" : "Nonaktif"
          const right = isMode ? mode() : models()[row]
          const hint = isMode ? "serial/paralel" : `tier ${ROLE_TIERS[row]}`
          const focused = i === focus()
          return (
            <box flexDirection="row">
              <text fg={focused ? theme.text.accent : theme.text.muted}>{focused ? "❯ " : "  "}</text>
              <text fg={focused ? theme.text.accent : theme.text.base}>{`${label.padEnd(9)} ${mid.padEnd(9)} ${right}  (${hint})`}</text>
            </box>
          )
        })}
      </box>
      <text fg={theme.text.muted}>↑↓ pindah • Enter ganti model/mode • Spasi aktif/nonaktif • Ctrl+S simpan • Esc batal</text>
      <text fg={theme.text.muted}>Model berlaku mulai sesi TUI berikutnya; peran + mode berlaku langsung.</text>
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
