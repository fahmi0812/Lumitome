// role-eval-mock-9router.mjs — mock 9router untuk eval harness peran v0.3.73.
// BUKAN bagian produk Lumitome — hanya fixture tes di tests/fixtures/.
// Pola dari mock-9router-0371 (scripted thinking->search->builder->reviewer),
// digeneralisasi untuk 3 golden task + cabang judge blind + L1 SELECT-ONLY.
//
// Perbedaan penting vs mock 0371: folder kerja (ws) TIDAK dari env TASK_WS —
// mock mengambilnya dari path tool-call read/write di riwayat, jadi 3 task
// dengan ws berbeda bisa jalan berurutan tanpa restart mock.
//   SCRIPTED=1 (default) — alur scripted; SCRIPTED=0 -> "ok (mock)" selalu.
//   MOCK_PORT (default 20128), MOCK_LOG / REQ_LOG (default ./mock.log, ./requests.jsonl).
//   TASK_WS (opsional, fallback bila path tidak ketemu di riwayat).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const MODELS = [
  "ag/gemini-3.8-flash-high",
  "kr/claude-opus-5.5-test-agentic",
  "ag/gemini-3.8-flash",
  "kr/claude-opus-5.5",
  "kr/claude-haiku-5.5",
  "kr/claude-sonnet-5.5",
];
const PORT = Number(process.env.MOCK_PORT || 20128);
const LOG = process.env.MOCK_LOG || path.join(process.cwd(), "mock.log");
const REQ_LOG = process.env.REQ_LOG || path.join(process.cwd(), "requests.jsonl");
const SCRIPTED = process.env.SCRIPTED !== "0";
const FALLBACK_WS = process.env.TASK_WS || process.cwd();
// EVAL_OUT: dir --out satu run eval (berisi <taskId>/ws/index.html per task).
// EVAL_OUT_BASE: dir INDUK yang berisi banyak run (run1, run2, ...) — mock
// memakai run TERBARU per task (berdasarkan mtime fixture), jadi eval boleh
// diulang dengan --out baru tanpa restart mock. Tanpa ini, mock yang
// dinyalakan sekali akan menulis ke run LAMA (terbukti live run5 0373:
// builder menulis ke run4/add-footer/ws — file run5 tetap murni, dan file
// run4 jadi ber-footer ganda). Urutan resolusi ws: run terbaru di
// EVAL_OUT_BASE -> EVAL_OUT/<taskId>/ws -> path tool-call -> TASK_WS/cwd.
const EVAL_OUT = process.env.EVAL_OUT || "";
const EVAL_OUT_BASE = process.env.EVAL_OUT_BASE || "";
const log = (m) => { try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`); } catch {} };
const logReq = (o) => { try { fs.appendFileSync(REQ_LOG, JSON.stringify({ t: new Date().toISOString(), ...o }) + "\n"); } catch {} };

function msgText(msgs) {
  const parts = [];
  const args = [];
  const walk = (o) => {
    if (typeof o === "string") parts.push(o);
    else if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") {
      if (typeof o.text === "string") parts.push(o.text);
      if (o.content !== undefined) walk(o.content);
      if (typeof o.arguments === "string") { parts.push(o.arguments); args.push(o.arguments); }
      if (o.tool_calls !== undefined) walk(o.tool_calls);
      if (typeof o.function === "object") walk(o.function);
    }
  };
  (msgs || []).forEach(walk);
  return { all: parts.join("\n"), toolArgs: args.join("\n") };
}

/** Folder kerja dari path file di argumen tool-call riwayat (fallback env/cwd). */
function wsFrom(toolArgs) {
  const m = toolArgs.match(/"(?:path|file)"\s*:\s*"([^"]*index\.html[^"]*)"/)
    || toolArgs.match(/"path"\s*:\s*"([^"]+)"/);
  if (m) return path.dirname(m[1]);
  return FALLBACK_WS;
}

/** Run terbaru per task di EVAL_OUT_BASE (run1, run2, ...) — null bila tak ada. */
function newestRunWs(taskId) {
  if (!EVAL_OUT_BASE || !taskId) return null;
  try {
    const cands = [];
    for (const n of fs.readdirSync(EVAL_OUT_BASE)) {
      if (!/^run\d+$/.test(n)) continue;
      const f = path.join(EVAL_OUT_BASE, n, taskId, "ws", "index.html");
      try { cands.push({ dir: path.dirname(f), t: fs.statSync(f).mtimeMs }); } catch {}
    }
    cands.sort((a, b) => b.t - a.t);
    return cands.length ? cands[0].dir : null;
  } catch { return null; }
}

/** Folder kerja task: run terbaru di EVAL_OUT_BASE -> EVAL_OUT -> tebak dari tool-call. */
function resolveWs(taskId, toolArgs) {
  return newestRunWs(taskId)
    || (EVAL_OUT && taskId ? path.join(EVAL_OUT, taskId, "ws") : null)
    || wsFrom(toolArgs);
}

function taskIdFrom(all) {
  const m = all.match(/\[EVAL-TASK:([a-z-]+)\]/) || all.match(/\[EVAL-JUDGE\] ([a-z-]+)/);
  return m ? m[1] : null;
}

// --- transformasi deterministik per task (cermin checker harness/role-eval.mjs) ---
function transformSearchFilter(src) {
  const kategori = { 1: "Kaos", 2: "Kemeja", 3: "Celana", 4: "Jaket", 5: "Kaos", 6: "Kemeja" };
  let out = src;
  for (const [id, kat] of Object.entries(kategori)) {
    out = out.replace(
      new RegExp(`(\\{ id: ${id}, nama: "[^"]+", harga: \\d+) \\}`),
      `$1, kategori: "${kat}" }`,
    );
  }
  out = out.replace(
    "<h1>TokoBajuKu</h1>",
    `<h1>TokoBajuKu</h1>\n<input id="cari" placeholder="Cari produk..." oninput="renderProduk()">\n<select id="filter-kategori" onchange="renderProduk()">\n  <option value="">Semua Kategori</option>\n  <option value="Kaos">Kaos</option>\n  <option value="Kemeja">Kemeja</option>\n  <option value="Celana">Celana</option>\n  <option value="Jaket">Jaket</option>\n</select>`,
  );
  out = out.replace(
    `function renderProduk() {
  document.getElementById("daftar-produk").innerHTML = PRODUK.map(p =>`,
    `function renderProduk() {
  const q = (document.getElementById("cari")?.value || "").toLowerCase();
  const kat = document.getElementById("filter-kategori")?.value || "";
  const tampil = PRODUK.filter(p =>
    p.nama.toLowerCase().includes(q) && (kat === "" || p.kategori === kat));
  document.getElementById("daftar-produk").innerHTML = tampil.map(p =>`,
  );
  return out;
}

function transformAddFooter(src) {
  return src.replace(
    "</body>",
    `<footer>\n  <p>© 2026 TokoBajuKu — Semua hak dilindungi</p>\n  <a href="#">Hubungi kami</a>\n</footer>\n</body>`,
  );
}

function transformFixTypo(src) {
  let out = src.replace("Sepatu Larii", "Sepatu Lari");
  out = out.replace(
    `  { id: 5, nama: "Sepatu Lari", harga: 299000 }\n];`,
    `  { id: 5, nama: "Sepatu Lari", harga: 299000 },\n  { id: 6, nama: "Tas Ransel", harga: 189000 }\n];`,
  );
  return out;
}

const TRANSFORMS = {
  "search-filter": transformSearchFilter,
  "add-footer": transformAddFooter,
  "fix-typo-add-item": transformFixTypo,
};

const TASK_SUMMARY = {
  "search-filter": "tambah pencarian produk + filter kategori",
  "add-footer": "tambah footer",
  "fix-typo-add-item": "perbaiki typo + tambah produk",
};

// --- checker cermin (dipakai cabang judge; logika sama dengan harness) ---
function judgeChecks(taskId, artifact) {
  const has = (s) => typeof artifact === "string" && artifact.includes(s);
  const count = (s) => (typeof artifact === "string" ? artifact.split(s).length - 1 : 0);
  if (taskId === "search-filter") {
    return {
      c1: has('id="cari"'),
      c2: has('id="filter-kategori"'),
      c3: count("kategori:") >= 6,
      c4: has('getElementById("filter-kategori")') && has('getElementById("cari")'),
      c5: has('id="keranjang"') && has('id="checkout"') && has("renderKeranjang"),
    };
  }
  if (taskId === "add-footer") {
    return {
      c1: has("<footer"),
      c2: has("© 2026 TokoBajuKu — Semua hak dilindungi"),
      c3: has("Hubungi kami"),
      c4: has("<h1>TokoBajuKu</h1>") && has('id="daftar-produk"'),
    };
  }
  if (taskId === "fix-typo-add-item") {
    return {
      c1: !has("Sepatu Larii"),
      c2: has('"Sepatu Lari"'),
      c3: has("Tas Ransel") && has("189000"),
      c4: count("nama:") === 6,
      c5: has("Kaos Polos Putih") && has("Jaket Hoodie"),
    };
  }
  return null;
}

let chatCount = 0;

function respond(model, msgs) {
  chatCount += 1;
  if (chatCount > 300) return { text: "EVAL-MOCK-CAP: berhenti." };
  const { all, toolArgs } = msgText(msgs);
  const has = (m) => all.includes(m);
  const hasArg = (m) => toolArgs.includes(m);
  const taskId = taskIdFrom(all);
  const ws = resolveWs(taskId, toolArgs);
  const file = path.join(ws, "index.html");

  // --- L1 SELECT-ONLY: jawab JSON valid (spike 0373: mock lama menjawab "ok (mock)" -> L1 invalid, fallback) ---
  if (has("Layer-1 SELECT-ONLY")) {
    return { text: '{"sectors":["web"],"skills":["web-artifacts-builder"],"confidence":0.9,"need_more":false}' };
  }
  // --- Penamaan percakapan (title call) ---
  if (has("You name conversations")) {
    return { text: "TokoBajuKu — eval peran" };
  }
  // --- JUDGE blind: nilai dari artefak di prompt saja, tanpa diagnosis ---
  if (has("[EVAL-JUDGE]")) {
    const m = all.match(/--- index\.html ---\n([\s\S]*?)\n\nKriteria/);
    const artifact = m ? m[1] : "";
    const criteria = judgeChecks(taskId, artifact);
    if (!criteria) return { text: '{"verdict":"FAIL","criteria":{},"notes":"task tidak dikenal"}' };
    const pass = Object.values(criteria).every(Boolean);
    return { text: JSON.stringify({ verdict: pass ? "PASS" : "FAIL", criteria, notes: pass ? "Semua kriteria terpenuhi dari artefak." : "Ada kriteria tidak terpenuhi dari artefak." }) };
  }

  // --- Parent (orchestrator): thinking -> search -> builder -> reviewer ---
  if (has("[HASIL-REVIEWER]")) {
    return { text: `Selesai. Tugas ${TASK_SUMMARY[taskId] || taskId || "?"} sudah dikerjakan di index.html; fitur lama tidak berubah. Reviewer: lolos tanpa temuan critical.` };
  }
  if (has("[HASIL-BUILDER]") && !hasArg("[DELEGASI-REVIEWER]")) {
    return { toolCalls: [{ name: "subagent", arguments: { description: "[Reviewer] Periksa hasil kerja di index.html", agent: "reviewer", prompt: `[DELEGASI-REVIEWER] Periksa perubahan index.html untuk tugas ${TASK_SUMMARY[taskId] || ""}: apakah hasil sesuai tugas dan fitur lama tetap utuh? Jawab dengan format HASIL + temuan critical bila ada.` } }], text: "" };
  }
  if (has("[HASIL-SEARCH]") && !hasArg("[DELEGASI-BUILDER]")) {
    return { toolCalls: [{ name: "subagent", arguments: { description: "[Builder] Implementasi tugas di index.html", agent: "builder", prompt: `[DELEGASI-BUILDER] Implementasikan di index.html sesuai rencana Thinking untuk tugas ${TASK_SUMMARY[taskId] || ""} [EVAL-TASK:${taskId}]. Jangan ubah fitur lama. Laporkan format HASIL.` } }], text: "" };
  }
  if (has("[HASIL-THINKING]") && !hasArg("[DELEGASI-SEARCH]")) {
    return { toolCalls: [{ name: "subagent", arguments: { description: "[Search] Cari pola yang relevan", agent: "search", prompt: `[DELEGASI-SEARCH] Cari di folder ini apakah sudah ada pola yang bisa dipakai ulang untuk index.html. Kembalikan HASIL + referensi file:baris + keyakinan.` } }], text: "" };
  }
  if (hasArg("[DELEGASI-THINKING]") && !has("[HASIL-THINKING]")) return { text: "Menunggu Thinking selesai." };
  if (hasArg("[DELEGASI-SEARCH]") && !has("[HASIL-SEARCH]")) return { text: "Menunggu Search selesai." };
  if (hasArg("[DELEGASI-BUILDER]") && !has("[HASIL-BUILDER]")) return { text: "Menunggu Builder selesai." };
  if (hasArg("[DELEGASI-REVIEWER]") && !has("[HASIL-REVIEWER]")) return { text: "Menunggu Reviewer selesai." };
  // Parent giliran pertama: delegasi ke Thinking. Syarat !has("[DELEGASI-")
  // WAJIB: prompt delegasi ke anak juga memuat [EVAL-TASK:...] — tanpa
  // syarat ini giliran pertama ANAK ikut kena cabang ini dan mendelegasikan
  // ke dirinya sendiri (terbukti live run1 0373: Thinking memanggil subagent
  // thinking, error executed:false, lalu "Menunggu Thinking selesai.").
  if (taskId && !has("[DELEGASI-")) {
    return { toolCalls: [{ name: "subagent", arguments: { description: `[Thinking] Rencanakan ${TASK_SUMMARY[taskId]} di index.html`, agent: "thinking", prompt: `[DELEGASI-THINKING] Baca index.html di folder ini lalu buat rencana ${TASK_SUMMARY[taskId]} [EVAL-TASK:${taskId}]. Jangan ubah fitur lama. Laporkan format HASIL + tiket + acceptance + TANYA.` } }], text: "" };
  }
  // --- Anak thinking: baca file dulu, lalu kirim rencana ---
  if (has("[DELEGASI-THINKING]")) {
    if (!has("TokoBajuKu")) {
      return { toolCalls: [{ name: "read", arguments: { path: file } }], text: "" };
    }
    return { text: `HASIL: Rencana ${TASK_SUMMARY[taskId] || "tugas"} di index.html.\nTiket 1: baca index.html dan pahami struktur.\nTiket 2: implementasi sesuai tugas tanpa mengubah fitur lama.\nTiket 3: verifikasi halaman tetap render + fitur lama utuh.\nAcceptance: semua kriteria tugas terpenuhi; fitur lama utuh.\nTANYA: -\n[HASIL-THINKING]` };
  }
  // --- Anak search: ringkasan saja ---
  if (has("[DELEGASI-SEARCH]")) {
    return { text: "HASIL: Tidak ada pencarian eksternal yang diperlukan — pola lokal sudah ada di index.html. Keyakinan: tinggi.\n[HASIL-SEARCH]" };
  }
  // --- Anak builder: baca file, tulis file baru, lalu lapor ---
  if (has("[DELEGASI-BUILDER]")) {
    if (has("Wrote file successfully")) {
      return { text: `HASIL: Tugas ${TASK_SUMMARY[taskId] || ""} diimplementasikan di index.html. Perintah: edit via write 1 file. Exit: ok.\n[HASIL-BUILDER]` };
    }
    if (!has("TokoBajuKu")) {
      return { toolCalls: [{ name: "read", arguments: { path: file } }], text: "" };
    }
    const fn = TRANSFORMS[taskId];
    if (!fn) return { text: "HASIL: task tidak dikenal, tidak ada perubahan.\n[HASIL-BUILDER]" };
    const next = fn(fs.readFileSync(file, "utf8"));
    return { toolCalls: [{ name: "write", arguments: { path: file, content: next } }], text: "" };
  }
  // --- Anak reviewer: review teks ---
  if (has("[DELEGASI-REVIEWER]")) {
    return { text: "HASIL: Review lolos. Spec: hasil sesuai tugas; fitur lama tidak diubah. Temuan critical: tidak ada.\n[HASIL-REVIEWER]" };
  }
  return { text: "ok (mock)" };
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://127.0.0.1:20128");
  log(`${req.method} ${u.pathname}`);
  if (req.method === "GET" && (u.pathname === "/v1/models" || u.pathname === "/models" || u.pathname === "/v1" || u.pathname === "/")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ object: "list", data: MODELS.map((id) => ({ id, object: "model", created: 1, owned_by: "mock" })) }));
    return;
  }
  if (req.method === "POST" && u.pathname === "/v1/chat/completions") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let stream = true;
      let model = "mock";
      let msgs = [];
      try {
        const j = JSON.parse(body || "{}");
        stream = j.stream !== false;
        model = j.model || "mock";
        msgs = j.messages || [];
        logReq({ model, stream, messages: msgs.map((m) => { const full = typeof m.content === "string" ? m.content : JSON.stringify(m.content || ""); return { role: m.role, tool_calls: m.tool_calls || undefined, sysLen: m.role === "system" ? full.length : undefined, sysHasProtocol: m.role === "system" ? full.includes("Mode subagent ON") : undefined, content: full.slice(0, 30000) }; }) });
      } catch (e) { log(`body parse gagal: ${e.message}`); }
      log(`chat model=${model} stream=${stream} scripted=${SCRIPTED}`);
      const r = SCRIPTED ? respond(model, msgs) : { text: "ok (mock)" };
      const finish = r.toolCalls ? "tool_calls" : "stop";
      if (!stream) {
        const choice = { index: 0, finish_reason: finish };
        if (r.toolCalls) {
          choice.message = { role: "assistant", content: r.text || null, tool_calls: r.toolCalls.map((t, i) => ({ id: `call_${Date.now()}_${i}`, type: "function", function: { name: t.name, arguments: JSON.stringify(t.arguments) } })) };
        } else {
          choice.message = { role: "assistant", content: r.text, finish_reason: "stop" };
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: "chatcmpl-mock", object: "chat.completion", created: 1, model, choices: [choice], usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } }));
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      const chunk = (delta, fin) => `data: ${JSON.stringify({ id: "chatcmpl-mock", object: "chat.completion.chunk", created: 1, model, choices: [{ index: 0, delta, finish_reason: fin }] })}\n\n`;
      let out = "";
      if (r.toolCalls) {
        r.toolCalls.forEach((t, i) => {
          out += chunk({ role: "assistant", tool_calls: [{ index: i, id: `call_${Date.now()}_${i}`, type: "function", function: { name: t.name, arguments: JSON.stringify(t.arguments) } }] }, null);
        });
        out += chunk({}, "tool_calls");
      } else {
        out += chunk({ role: "assistant", content: r.text }, null);
        out += chunk({}, "stop");
      }
      res.end(out + "data: [DONE]\n\n");
    });
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "mock: not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  log(`role-eval-mock listening 127.0.0.1:${PORT} scripted=${SCRIPTED}`);
  console.log(`role-eval-mock listening 127.0.0.1:${PORT} scripted=${SCRIPTED}`);
});
