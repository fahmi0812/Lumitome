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
//   ke sumber opencode v2.3.0 + v2.2.4), lalu pemberitahuan SINGKAT dikirim
//   ke sesi lewat session.prompt (fire-and-forget) — TAPI sejak v0.3.68
//   HANYA bila sesi sudah berjalan sebelum save. Sesi BARU (dibuat lewat
//   "Ya, mulai") tidak menerima notice: ia membaca konfigurasi dari blok
//   di .opencode/rules/subagent.md (mapping peran→model + urutan + mode,
//   disinkronkan saat save) — tanpa kesan prompt injection.
//   Aturan lengkap TIDAK di-inject sebagai prompt raksasa (v0.3.67 — Fahmi
//   menilai aneh): aturan statis tinggal di file agent (orchestrator.md +
//   file peran + rules/subagent.md); ke sesi lama hanya mode + urutan +
//   model Thinking + tugas (maks 2 baris).
//   Model PERAN berlaku mulai sesi TUI berikutnya — jujur di toast.
//   Bila belum ada sesi saat menyimpan (home screen), sesi baru yang dibuat
//   sesudah itu otomatis dialihkan ke Thinking oleh server plugin
//   (index.ts, langganan session.created) — jadi status line menunjukkan
//   Thinking sejak pesan pertama.
//   v0.3.66: sesudah simpan ada SATU pilihan akhir — "Masuk mode subagent
//   sekarang?" [Ya, mulai] langsung masuk mode subagent (sesi aktif dialihkan
//   ke Thinking; bila belum ada sesi, sesi baru DIBUKA dengan model Thinking
//   lalu TUI diarahkan ke sana), [Simpan saja] hanya menyimpan konfigurasi.
//   v0.3.66 juga: model default sesi TUI ikut preset Thinking (wrapper
//   lumitome.mjs) — akar bug live v0.3.65: TUI menimpa switchModel watcher
//   dengan model default config (gemini) saat pesan pertama dikirim.
//   v0.3.69: (a) sesi baru "Ya, mulai" dibuat DENGAN location.directory =
//     cwd proses TUI (folder proyek) — tanpa itu server memakai cwd-nya
//     sendiri (/home/hatch); (b) toast singkat "<Peran> jalan" saat subagent
//     mulai (langganan event session.tool.called — baris TUI hanya
//     "Running subagent…" generik); (c) model tersimpan yang tidak ada di
//     daftar live tetap ditawarkan + ditandai, bukan diam-diam diganti
//     models[0] (bug H2 terbukti live: kr opus → ag gemini).
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
  sessionCreateLocation,
  subagentStartInfo,
  modelOptionsForRole,
} from "./flow.mjs"
import { buildSubagentNotice } from "./prompt.mjs"

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
 * Beri tahu user peran mana yang mulai berjalan (v0.3.69 — jawaban atas
 * temuan Fahmi: baris TUI hanya "Running subagent…" generik saat anak
 * berjalan; nama peran baru muncul sesudah selesai).
 * Langganan event server via client.event.subscribe (SSE /api/event):
 * session.tool.called di sesi yang sedang ditampilkan, input.agent salah
 * satu peran → toast singkat "<Label> jalan" + deskripsi delegasi.
 * Fire-and-forget + fail-silent: toast tidak boleh mematikan plugin.
 */
function watchSubagentStarts(context) {
  if (typeof context?.client?.event?.subscribe !== "function") return
  void (async () => {
    try {
      for await (const event of context.client.event.subscribe({ types: ["session.tool.called"] })) {
        try {
          if (event?.type !== "session.tool.called") continue
          if (event?.data?.sessionID !== currentSessionID(context)) continue
          const info = subagentStartInfo(event?.data?.input)
          if (!info) continue
          toast(context, `${info.label} jalan`, info.description || "Delegasi peran dimulai.")
        } catch {}
      }
    } catch {}
  })()
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

async function sendSubagentNotice(context, preset, task, sessionIDOverride) {
  const sessionID = sessionIDOverride ?? currentSessionID(context)
  if (!sessionID) {
    toast(context, "Tidak ada sesi aktif", "Konfigurasi tersimpan — delegasi menunggu sesi.")
    return
  }
  const text = buildSubagentNotice(preset, task)
  // Bentuk resmi opencode 2.3.0 + 2.2.4: session.prompt({ sessionID, text })
  // (SessionPromptInput — tidak ada field `parts`; bentuk v0.3.63 dengan
  // `parts: [{ type: "text", text }]` gagal live: "Missing key at ["text"]".)
  context.client.session.prompt({ sessionID, text }).catch((e) => {
    toast(context, "Gagal mengirim ke sesi", String(e?.message ?? e), "error")
  })
}

/**
 * Masuk mode subagent SEKARANG (v0.3.66 — pilihan akhir sesudah simpan):
 * sesi (baru atau yang aktif) langsung pakai model Thinking — user tidak
 * perlu ketik pesan dulu atau restart TUI.
 * v0.3.68: pemberitahuan singkat HANYA dikirim bila sesi SUDAH BERJALAN
 * sebelum save (sesi lama butuh diberi tahu karena tidak memuat file agent
 * baru). Sesi BARU yang dibuat di sini TIDAK menerima notice sama sekali —
 * ia memuat konfigurasi (mapping peran→model + urutan + mode) dari blok
 * di .opencode/rules/subagent.md — bersih, tanpa kesan prompt injection
 * (keluhan Fahmi 17:20 WIB).
 * Bila belum ada sesi: sesi baru DIBUKA di sini (client.session.create
 * dengan model Thinking) lalu TUI diarahkan ke sesi itu (router.navigate);
 * watcher server plugin melewatinya (model awal sudah Thinking, bukan
 * default terpin). v0.3.69: create DENGAN location.directory = cwd proses
 * TUI (folder proyek) — tanpa location, server memakai cwd prosesnya
 * sendiri (/home/hatch), terbukti dari DB sesi uji end-to-end v0.3.68
 * (117/117 sesi directory=/home/hatch). Gagal di langkah mana pun →
 * kembalikan catatan jujur (preset sudah tersimpan; user bisa buka sesi
 * manual).
 */
async function enterSubagentMode(context, preset, task) {
  const full = thinkingSessionModel(preset)
  if (!full) return "Model sesi tidak diubah (Thinking nonaktif)."
  const parts = splitModelId(full)
  if (!parts) return "Model sesi tidak diubah (model Thinking tidak valid)."
  let sessionID = currentSessionID(context)
  const preExisting = sessionID !== undefined
  if (sessionID) {
    try {
      await context.client.session.switchModel({ sessionID, model: { providerID: parts.providerID, id: parts.id } })
    } catch (e) {
      return `Model sesi gagal dialihkan (${String(e?.message ?? e)}) — preset tetap tersimpan; ganti manual via /models.`
    }
  } else {
    try {
      const created = await context.client.session.create({ model: { providerID: parts.providerID, id: parts.id }, agent: "orchestrator", ...sessionCreateLocation(process.cwd()) })
      sessionID = created?.id ?? created?.sessionID ?? created?.data?.id
      if (!sessionID) return "Sesi baru gagal dibuat (tidak ada ID) — konfigurasi tersimpan; buka sesi baru manual."
      if (typeof context.ui.router?.navigate === "function") {
        try { context.ui.router.navigate({ type: "session", sessionID }) } catch {}
      }
    } catch (e) {
      return `Sesi baru gagal dibuat (${String(e?.message ?? e)}) — konfigurasi tersimpan; buka sesi baru manual.`
    }
  }
  if (preExisting) {
    await sendSubagentNotice(context, preset, task, sessionID)
  }
  return `Sesi memakai ${full} (Thinking).`
}

async function saveAndDelegate(context, rpc, next, task) {
  let saved
  try {
    saved = await rpc.savePreset({ preset: next })
  } catch (e) {
    toast(context, "Gagal menyimpan preset", String(e?.message ?? e), "error")
    return
  }
  // v0.3.69: peringatan "model tersimpan dipertahankan" datang dari server
  // (validatePreset grandfathering, saved.warnings) — ditempel ke toast di
  // bawah; dialog tidak perlu mencatatnya lagi.
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
    const note = await enterSubagentMode(context, next, task)
    toast(context, "Mode subagent jalan", `${summarizePreset(next)} — ${note}${warn}`)
    return
  }
  const switched = await switchSessionToThinking(context, next)
  toast(
    context,
    "Subagent disimpan",
    `${summarizePreset(next)} — ${switched.note} Model peran berlaku mulai sesi TUI berikutnya.${warn}`,
  )
  // v0.3.68: tanpa sesi, sendSubagentNotice hanya menampilkan toast
  // "Tidak ada sesi aktif" — toast itu menimpa "Subagent disimpan" sebelum
  // sempat dirender (durasi 9 detik, satu toast tampil). Lewati bila tidak
  // ada sesi: tidak ada yang dikirimi notice; info "tidak ada sesi aktif"
  // sudah ada di badan toast di atas (switched.note).
  if (currentSessionID(context)) await sendSubagentNotice(context, next, task)
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
  // v0.3.69: model tersimpan yang tidak ada di daftar live tetap ditawarkan
  // (modelOptionsForRole) + ditandai "Tersimpan — tidak ada di daftar live";
  // server meng-grandfather-nya saat save (peringatan, bukan error).
  if (live && models.length > 1) {
    for (const role of ROLES) {
      const { options, current, storedMissing } = modelOptionsForRole(models, byRole[role])
      const m = await context.ui.dialog.select({
        title: `Model — ${ROLE_LABELS[role]} (tier ${ROLE_TIERS[role]})`,
        current,
        options: options.map((id) => ({ title: id, value: id, description: id === byRole[role] && storedMissing ? "Tersimpan — tidak ada di daftar live" : `Tier ${ROLE_TIERS[role]} — ${ROLE_DESC[role]}` })),
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
  await saveAndDelegate(context, rpc, next, task)
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
      await saveAndDelegate(context, rpc, next, task)
      return
    }
    if (action.type === "model") {
      if (!live) {
        toast(context, "Daftar model tidak bisa dibaca", "Model per peran dipertahankan (server 9router tidak merespons).")
        focus = action.focus
        continue
      }
      // v0.3.69: seperti Stage A — model tersimpan yang tidak ada di daftar
      // live tetap ditawarkan + ditandai, bukan diam-diam diganti models[0].
      const { options, current, storedMissing } = modelOptionsForRole(models, state.models[action.role])
      const m = await context.ui.dialog.select({
        title: `Model — ${ROLE_LABELS[action.role]} (tier ${ROLE_TIERS[action.role]})`,
        current,
        options: options.map((id) => ({ title: id, value: id, description: id === state.models[action.role] && storedMissing ? "Tersimpan — tidak ada di daftar live" : `Tier ${ROLE_TIERS[action.role]}` })),
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
    // v0.3.69: pengamat peran berjalan — toast "<Peran> jalan" saat subagent
    // mulai di sesi yang sedang ditampilkan (fire-and-forget, fail-silent).
    watchSubagentStarts(context)
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
