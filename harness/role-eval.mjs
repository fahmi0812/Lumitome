#!/usr/bin/env node
/**
 * Eval harness peran /subagent (v0.3.73, P4 fullcheck — Karpathy: evals-driven).
 *
 * Golden task kecil yang jawabannya bisa dicek otomatis (file berubah/tidak,
 * isi benar/tidak) + protokol blind forward-test ala Codex (CL4R1T4S):
 * subagent penguji (judge) HANYA menerima artefak hasil kerja — TANPA
 * diagnosis, penjelasan, atau transkrip dari Builder/orchestrator — dan
 * menilai dari artefaknya saja.
 *
 * Modul ini MURNI + deterministik: tidak ada panggilan model, tidak ada
 * proses anak, tidak ada jaringan. Runner + CLI hidup di
 * scripts/role-eval.mjs; sensus delegasi dari DB sesi hidup di
 * harness/role-eval-census.py (stdlib sqlite3, dipanggil CLI bila ada).
 *
 * Skor per task:
 *   (a) taskPass — checker deterministik atas file hasil kerja (utama);
 *   (b) judgeVerdict — verdict blind judge (PASS/FAIL/null bila tak terbaca);
 *   (c) census — sesi anak per peran dari DB sesi engine (rolesDelegated,
 *       rolesCompleted, parentSubagentCalls); null bila DB tak terbaca;
 *   (d) delegationRate — dari $LUMI_HOME/subagent-metrics.jsonl (v0.3.70);
 *       null bila tidak ada data — di mode headless `lumitome run` hook
 *       plugin server TIDAK jalan (terbukti 16 Nov 2026: tanpa file metrik
 *       walau LUMI_DEBUG=1), jadi null di sana adalah HASIL yang jujur,
 *       bukan 0, dan sensus DB adalah sumber delegasi utama.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EVAL_VERSION = "0.3.73";
export const ROLES = ["thinking", "search", "builder", "reviewer"];
export const DEFAULT_TIMEOUT_MS = 300000;
export const DEFAULT_JUDGE_TIMEOUT_MS = 180000;

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = path.join(HERE, "role-eval-fixtures");

/** Satu check: id stabil, deskripsi (dipakai juga sebagai rubrik judge), fn(files) -> {pass, detail}. */
const check = (id, desc, fn) => ({ id, desc, fn });

function count(hay, needle) {
  if (typeof hay !== "string") return 0;
  return hay.split(needle).length - 1;
}

export const TASKS = [
  {
    id: "search-filter",
    title: "Tambah pencarian + filter kategori",
    prompt:
      "Di folder ini ada index.html toko baju. Tambahkan pencarian produk dan filter kategori (Kaos, Kemeja, Celana, Jaket) yang bisa dipakai bersamaan. Jangan ubah fitur lama (daftar produk, keranjang, checkout dummy). [EVAL-TASK:search-filter]",
    files: ["index.html"],
    checks: [
      check("c1", "input pencarian #cari ada", ({ index }) => ({ pass: typeof index === "string" && index.includes('id="cari"'), detail: "id=\"cari\" tidak ditemukan" })),
      check("c2", "select filter #filter-kategori ada", ({ index }) => ({ pass: typeof index === "string" && index.includes('id="filter-kategori"'), detail: "id=\"filter-kategori\" tidak ditemukan" })),
      check("c3", "kategori diisi di 6 produk", ({ index }) => { const n = count(index, "kategori:"); return { pass: n >= 6, detail: `kategori: muncul ${n}x (butuh >= 6)` }; }),
      check("c4", "logika filter gabungan nama+kategori ada", ({ index }) => ({ pass: typeof index === "string" && index.includes('getElementById("filter-kategori")') && index.includes('getElementById("cari")'), detail: "renderProduk tidak membaca #cari + #filter-kategori" })),
      check("c5", "fitur lama utuh (keranjang + checkout)", ({ index }) => ({ pass: typeof index === "string" && index.includes('id="keranjang"') && index.includes('id="checkout"') && index.includes("renderKeranjang"), detail: "keranjang/checkout hilang atau berubah" })),
    ],
  },
  {
    id: "add-footer",
    title: "Tambah footer",
    prompt:
      "Di folder ini ada index.html toko baju sederhana. Tambahkan footer di bawah halaman dengan teks persis '© 2026 TokoBajuKu — Semua hak dilindungi' dan tautan 'Hubungi kami'. Jangan ubah konten lama. [EVAL-TASK:add-footer]",
    files: ["index.html"],
    checks: [
      check("c1", "elemen <footer> ada", ({ index }) => ({ pass: typeof index === "string" && index.includes("<footer"), detail: "<footer tidak ditemukan" })),
      check("c2", "teks copyright persis ada", ({ index }) => ({ pass: typeof index === "string" && index.includes("© 2026 TokoBajuKu — Semua hak dilindungi"), detail: "teks copyright tidak ditemukan persis" })),
      check("c3", "tautan 'Hubungi kami' ada", ({ index }) => ({ pass: typeof index === "string" && index.includes("Hubungi kami"), detail: "'Hubungi kami' tidak ditemukan" })),
      check("c4", "konten lama utuh (judul + daftar produk)", ({ index }) => ({ pass: typeof index === "string" && index.includes("<h1>TokoBajuKu</h1>") && index.includes('id="daftar-produk"'), detail: "konten lama hilang atau berubah" })),
    ],
  },
  {
    id: "fix-typo-add-item",
    title: "Perbaiki typo + tambah produk",
    prompt:
      "Di folder ini ada index.html toko baju. Perbaiki salah ketik 'Sepatu Larii' menjadi 'Sepatu Lari', lalu tambahkan satu produk baru 'Tas Ransel' seharga 189000 ke daftar PRODUK. Jangan ubah produk lain. [EVAL-TASK:fix-typo-add-item]",
    files: ["index.html"],
    checks: [
      check("c1", "typo 'Sepatu Larii' hilang", ({ index }) => ({ pass: typeof index === "string" && !index.includes("Sepatu Larii"), detail: "typo 'Sepatu Larii' masih ada" })),
      check("c2", "nama benar 'Sepatu Lari' ada", ({ index }) => ({ pass: typeof index === "string" && index.includes('"Sepatu Lari"'), detail: "'Sepatu Lari' tidak ditemukan" })),
      check("c3", "produk baru 'Tas Ransel' 189000 ada", ({ index }) => ({ pass: typeof index === "string" && index.includes("Tas Ransel") && index.includes("189000"), detail: "'Tas Ransel' 189000 tidak ditemukan" })),
      check("c4", "jumlah produk menjadi 6", ({ index }) => { const n = count(index, "nama:"); return { pass: n === 6, detail: `produk berjumlah ${n} (butuh 6)` }; }),
      check("c5", "produk lama utuh", ({ index }) => ({ pass: typeof index === "string" && index.includes("Kaos Polos Putih") && index.includes("Jaket Hoodie"), detail: "produk lama hilang atau berubah" })),
    ],
  },
];

export function listTasks() {
  return TASKS.map(({ id, title, prompt, files }) => ({ id, title, prompt, files }));
}

export function getTask(id) {
  return TASKS.find((t) => t.id === id);
}

/** Baca file-file task dari workdir (hilang -> null; checker yang menilai). */
export function readTaskFiles(task, workdir) {
  const out = {};
  for (const f of task.files) {
    try { out[path.basename(f, path.extname(f))] = fs.readFileSync(path.join(workdir, f), "utf8"); }
    catch { out[path.basename(f, path.extname(f))] = null; }
  }
  return out;
}

/** Checker deterministik: {pass, checks:[{id, desc, pass, detail}]}. */
export function checkTask(task, workdir) {
  const files = readTaskFiles(task, workdir);
  const checks = task.checks.map((c) => {
    let r;
    try { r = c.fn(files); } catch (e) { r = { pass: false, detail: `checker error: ${e.message}` }; }
    return { id: c.id, desc: c.desc, pass: r.pass === true, detail: r.pass === true ? "" : (r.detail || "") };
  });
  return { pass: checks.every((c) => c.pass), checks };
}

/**
 * Prompt blind judge (protokol Codex): HANYA artefak + tugas asli + rubrik.
 * Tanpa transkrip, tanpa diagnosis Builder/orchestrator, tanpa riwayat cara
 * kerja — judge menilai dari artefaknya saja. Marker [EVAL-JUDGE] di baris
 * pertama dipakai mock tes untuk bercabang; model asli mengabaikannya.
 */
export function buildJudgePrompt(task, artifacts) {
  const blocks = Object.entries(artifacts)
    .map(([name, content]) => `--- ${name} ---\n${content ?? "(file hilang)"}`)
    .join("\n\n");
  const rubric = task.checks.map((c) => `- ${c.id}: ${c.desc}`).join("\n");
  return [
    `[EVAL-JUDGE] ${task.id}`,
    "Kamu penilai independen. Nilai HANYA dari artefak di bawah ini — kamu tidak tahu siapa yang membuatnya, bagaimana cara membuatnya, atau apa yang terjadi selama pengerjaan; jangan minta penjelasan tambahan.",
    "",
    `Tugas asli: ${task.prompt}`,
    "",
    "Artefak (isi file hasil kerja):",
    blocks,
    "",
    "Kriteria (jawab tiap kriteria true/false):",
    rubric,
    "",
    'Jawab HANYA dengan satu objek JSON persis format ini (tanpa teks lain):',
    '{"verdict":"PASS"|"FAIL","criteria":{"c1":true,...},"notes":"<satu kalimat>"}',
    "PASS bila semua kriteria true, selain itu FAIL.",
  ].join("\n");
}

/** Parse verdict judge: objek JSON pertama yang valid bentuknya; null bila tak terbaca. */
export function parseJudgeVerdict(text) {
  if (typeof text !== "string") return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj;
  try { obj = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  if (!obj || (obj.verdict !== "PASS" && obj.verdict !== "FAIL")) return null;
  if (!obj.criteria || typeof obj.criteria !== "object" || Array.isArray(obj.criteria)) return null;
  if (!Object.values(obj.criteria).every((v) => typeof v === "boolean")) return null;
  return { verdict: obj.verdict, criteria: obj.criteria, notes: typeof obj.notes === "string" ? obj.notes : "" };
}

/**
 * Agregat satu run eval. taskResults: [{taskId, pass, judgeVerdict|null,
 * census|null, delegationRate|null, durationMs, exitCode, timedOut}].
 * delegationRate null (tanpa data metrik) TIDAK dihitung sebagai 0 — median
 * hanya dari nilai non-null; bila semuanya null, agregatnya null.
 */
export function scoreEval(taskResults) {
  const total = taskResults.length;
  const passed = taskResults.filter((r) => r.pass).length;
  const judged = taskResults.filter((r) => r.judgeVerdict && (r.judgeVerdict.verdict === "PASS" || r.judgeVerdict.verdict === "FAIL"));
  const judgePassed = judged.filter((r) => r.judgeVerdict.verdict === "PASS").length;
  const agreement = judged.filter((r) => (r.judgeVerdict.verdict === "PASS") === r.pass).length;
  const withCensus = taskResults.filter((r) => r.census && Array.isArray(r.census.rolesDelegated));
  const fullDelegation = withCensus.filter((r) => ROLES.every((role) => r.census.rolesDelegated.includes(role))).length;
  const rates = taskResults.map((r) => r.delegationRate).filter((v) => typeof v === "number");
  rates.sort((a, b) => a - b);
  const medianRate = rates.length ? rates[Math.floor(rates.length / 2)] : null;
  return {
    tasksTotal: total,
    tasksPassed: passed,
    tasksPassedJudge: judgePassed,
    judgeTotal: judged.length,
    judgeAgreement: judged.length ? agreement / judged.length : null,
    censusTotal: withCensus.length,
    fullDelegation,
    rolesCoverage: withCensus.length ? fullDelegation / withCensus.length : null,
    delegationRateMedian: medianRate,
    delegationRateMeasured: rates.length,
    tasks: taskResults.map((r) => ({
      taskId: r.taskId,
      pass: r.pass,
      judgeVerdict: r.judgeVerdict ? r.judgeVerdict.verdict : null,
      rolesDelegated: r.census ? r.census.rolesDelegated : null,
      rolesCompleted: r.census ? r.census.rolesCompleted : null,
      parentSubagentCalls: r.census ? r.census.parentSubagentCalls : null,
      delegationRate: r.delegationRate ?? null,
      durationMs: r.durationMs ?? null,
      exitCode: r.exitCode ?? null,
      timedOut: r.timedOut === true,
    })),
  };
}

/** Laporan markdown (murni) untuk satu run eval. */
export function renderMarkdown(result) {
  const s = result.scores;
  const lines = [
    `# Role Eval — /subagent (v${EVAL_VERSION})`,
    "",
    `Mode: ${result.mode} · engine: ${result.engine ?? "?"} · tanggal: ${result.startedAt} · durasi total: ${((result.durationMs ?? 0) / 1000).toFixed(1)}s`,
    `Preset: ${result.preset?.enabled === false ? "OFF" : "ON"} · Thinking: ${result.preset?.thinking ?? "?"} · Build: ${result.preset?.build ?? "?"} · Review: ${result.preset?.review ?? "?"} · Search: ${result.preset?.search ?? "?"}`,
    "",
    "## Skor",
    "",
    `- Tugas lolos (checker deterministik): **${s.tasksPassed}/${s.tasksTotal}**`,
    `- Judge blind lolos: **${s.tasksPassedJudge}/${s.judgeTotal}** dinilai (kesepakatan judge↔checker: ${s.judgeAgreement === null ? "tidak terukur" : `${(s.judgeAgreement * 100).toFixed(0)}%`})`,
    `- Delegasi penuh 4 peran (sensus DB sesi): **${s.fullDelegation}/${s.censusTotal}** tugas ${s.rolesCoverage === null ? "(sensus tidak tersedia)" : `(${(s.rolesCoverage * 100).toFixed(0)}%)`}`,
    `- Delegation-rate median (metrics JSONL v0.3.70): ${s.delegationRateMedian === null ? "tidak terukur" : `${(s.delegationRateMedian * 100).toFixed(0)}%`} (terukur di ${s.delegationRateMeasured}/${s.tasksTotal} tugas)`,
    "",
    "## Per tugas",
    "",
    "| tugas | checker | judge | peran didelegasikan | peran selesai | panggilan subagent parent | delegation-rate | durasi |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const t of s.tasks) {
    lines.push(`| ${t.taskId} | ${t.pass ? "PASS" : "FAIL"} | ${t.judgeVerdict ?? "-"} | ${(t.rolesDelegated ?? []).join(", ") || "-"} | ${(t.rolesCompleted ?? []).join(", ") || "-"} | ${t.parentSubagentCalls ?? "-"} | ${t.delegationRate === null ? "-" : `${(t.delegationRate * 100).toFixed(0)}%`} | ${t.durationMs === null ? "-" : `${(t.durationMs / 1000).toFixed(1)}s`} |`);
  }
  lines.push(
    "",
    "## Batasan jujur",
    "",
    "- Skor dasar dari mock 9router bila mode=mock — BUKAN model asli; angka dengan model asli bisa berbeda.",
    "- Di mode headless `lumitome run`, hook plugin server v0.3.70 tidak jalan (terbukti live): tidak ada file metrik, jadi delegation-rate null — sensus DB sesi adalah sumber delegasi utama di mode ini.",
    "- Judge blind menilai artefak saja; ia tetap model yang sama (bukan manusia) — kesepakatan judge↔checker bukan kebenaran mutlak.",
    "",
  );
  return lines.join("\n");
}
