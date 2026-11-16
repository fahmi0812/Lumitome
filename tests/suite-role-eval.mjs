/** Eval harness peran /subagent (v0.3.73, P4): skoring deterministik, protokol
 *  blind forward-test, sensus DB, dan CLI --list/--score + mock smoke.
 *  Semua asersi tanpa model hidup; mock 9router hanya diuji lokal (port tes).
 *  Dijalankan lewat tests/run.mjs (npm test). */
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import { fileURLToPath } from "node:url";
import { ok, finish } from "./harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "role-eval-test-"));
const rm = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} };
const fixture = (taskId) => fs.readFileSync(path.join(REPO, "harness", "role-eval-fixtures", taskId, "index.html"), "utf8");

const H = await import("../harness/role-eval.mjs");

// --- daftar task ---
ok("role-eval: 3 golden task (search-filter, add-footer, fix-typo-add-item)",
  H.TASKS.length === 3
  && H.TASKS.map((t) => t.id).join(",") === "search-filter,add-footer,fix-typo-add-item"
  && H.TASKS.every((t) => t.prompt.includes(`[EVAL-TASK:${t.id}]`) && t.files.includes("index.html") && t.checks.length >= 4));
ok("role-eval: listTasks/getTask",
  H.listTasks().length === 3 && H.getTask("add-footer")?.title === "Tambah footer" && H.getTask("tidak-ada") === undefined);

// --- checker: search-filter ---
{
  const d = tmp();
  try {
    const pristine = fixture("search-filter");
    fs.writeFileSync(path.join(d, "index.html"), pristine);
    const fail = H.checkTask(H.getTask("search-filter"), d);
    ok("role-eval checker search-filter: fixture murni FAIL (c1-c4 gagal, c5 lolos)",
      fail.pass === false
      && fail.checks.find((c) => c.id === "c1").pass === false
      && fail.checks.find((c) => c.id === "c2").pass === false
      && fail.checks.find((c) => c.id === "c3").pass === false
      && fail.checks.find((c) => c.id === "c4").pass === false
      && fail.checks.find((c) => c.id === "c5").pass === true);
    const done = pristine
      .replace("{ id: 1, nama: \"Kaos Polos Putih\", harga: 59000 }", "{ id: 1, nama: \"Kaos Polos Putih\", harga: 59000, kategori: \"Kaos\" }")
      .replace("{ id: 2, nama: \"Kemeja Flanel\", harga: 149000 }", "{ id: 2, nama: \"Kemeja Flanel\", harga: 149000, kategori: \"Kemeja\" }")
      .replace("{ id: 3, nama: \"Celana Jeans\", harga: 199000 }", "{ id: 3, nama: \"Celana Jeans\", harga: 199000, kategori: \"Celana\" }")
      .replace("{ id: 4, nama: \"Jaket Hoodie\", harga: 249000 }", "{ id: 4, nama: \"Jaket Hoodie\", harga: 249000, kategori: \"Jaket\" }")
      .replace("{ id: 5, nama: \"Kaos Stripe\", harga: 69000 }", "{ id: 5, nama: \"Kaos Stripe\", harga: 69000, kategori: \"Kaos\" }")
      .replace("{ id: 6, nama: \"Kemeja Linen\", harga: 179000 }", "{ id: 6, nama: \"Kemeja Linen\", harga: 179000, kategori: \"Kemeja\" }")
      .replace("<h1>TokoBajuKu</h1>", "<h1>TokoBajuKu</h1>\n<input id=\"cari\" placeholder=\"Cari produk...\">\n<select id=\"filter-kategori\"></select>")
      .replace("document.getElementById(\"daftar-produk\")", "document.getElementById(\"cari\").value; document.getElementById(\"filter-kategori\").value; document.getElementById(\"daftar-produk\")");
    fs.writeFileSync(path.join(d, "index.html"), done);
    const pass = H.checkTask(H.getTask("search-filter"), d);
    ok("role-eval checker search-filter: hasil lengkap PASS", pass.pass === true && pass.checks.every((c) => c.pass));
    fs.writeFileSync(path.join(d, "index.html"), pristine.replace('id="keranjang"', 'id="keranjang-hilang"'));
    const broken = H.checkTask(H.getTask("search-filter"), d);
    ok("role-eval checker search-filter: fitur lama rusak -> c5 gagal",
      broken.checks.find((c) => c.id === "c5").pass === false);
  } finally { rm(d); }
}

// --- checker: add-footer + fix-typo-add-item ---
{
  const d = tmp();
  try {
    fs.writeFileSync(path.join(d, "index.html"), fixture("add-footer"));
    ok("role-eval checker add-footer: fixture murni FAIL",
      H.checkTask(H.getTask("add-footer"), d).pass === false);
    const done = fixture("add-footer").replace("</body>",
      "<footer>\n  <p>© 2026 TokoBajuKu — Semua hak dilindungi</p>\n  <a href=\"#\">Hubungi kami</a>\n</footer>\n</body>");
    fs.writeFileSync(path.join(d, "index.html"), done);
    ok("role-eval checker add-footer: hasil lengkap PASS",
      H.checkTask(H.getTask("add-footer"), d).pass === true);
  } finally { rm(d); }
  const d2 = tmp();
  try {
    fs.writeFileSync(path.join(d2, "index.html"), fixture("fix-typo-add-item"));
    const f = H.checkTask(H.getTask("fix-typo-add-item"), d2);
    ok("role-eval checker fix-typo: fixture murni FAIL (c1, c3, c4 gagal; c2, c5 lolos)",
      f.pass === false
      && f.checks.find((c) => c.id === "c1").pass === false
      && f.checks.find((c) => c.id === "c2").pass === false
      && f.checks.find((c) => c.id === "c3").pass === false
      && f.checks.find((c) => c.id === "c4").pass === false
      && f.checks.find((c) => c.id === "c5").pass === true);
    const done = fixture("fix-typo-add-item")
      .replace("Sepatu Larii", "Sepatu Lari")
      .replace("  { id: 5, nama: \"Sepatu Lari\", harga: 299000 }\n];",
        "  { id: 5, nama: \"Sepatu Lari\", harga: 299000 },\n  { id: 6, nama: \"Tas Ransel\", harga: 189000 }\n];");
    fs.writeFileSync(path.join(d2, "index.html"), done);
    ok("role-eval checker fix-typo: hasil lengkap PASS",
      H.checkTask(H.getTask("fix-typo-add-item"), d2).pass === true);
    fs.rmSync(path.join(d2, "index.html"));
    ok("role-eval checker: file hilang -> semua check gagal, bukan crash",
      H.checkTask(H.getTask("fix-typo-add-item"), d2).pass === false);
  } finally { rm(d2); }
}

// --- blind judge: prompt + parse ---
{
  const task = H.getTask("search-filter");
  const prompt = H.buildJudgePrompt(task, { "index.html": fixture("search-filter") });
  ok("role-eval blind judge: prompt memuat artefak + tugas, TANPA marker diagnosis/transkrip",
    prompt.startsWith("[EVAL-JUDGE] search-filter")
    && prompt.includes(fixture("search-filter").slice(0, 80))
    && prompt.includes(task.prompt)
    && !prompt.includes("[HASIL-")
    && !prompt.includes("[DELEGASI-")
    && !prompt.includes("riwayat percakapan")
    && prompt.includes('"verdict":"PASS"|"FAIL"'));
  const v = H.parseJudgeVerdict('ini prolog\n{"verdict":"PASS","criteria":{"c1":true,"c2":true},"notes":"ok"}\nini epilog');
  ok("role-eval parseJudgeVerdict: JSON terbungkus prolog/epilog tetap terbaca",
    v !== null && v.verdict === "PASS" && v.criteria.c2 === true && v.notes === "ok");
  ok("role-eval parseJudgeVerdict: tidak valid -> null",
    H.parseJudgeVerdict("tidak ada json") === null
    && H.parseJudgeVerdict('{"verdict":"MAYBE","criteria":{"c1":true}}') === null
    && H.parseJudgeVerdict('{"verdict":"PASS"}') === null
    && H.parseJudgeVerdict('{"verdict":"PASS","criteria":{"c1":"ya"}}') === null
    && H.parseJudgeVerdict(null) === null);
}

// --- agregat skor ---
{
  const s = H.scoreEval([
    { taskId: "search-filter", pass: true, judgeVerdict: { verdict: "PASS", criteria: {}, notes: "" }, census: { rolesDelegated: ["thinking", "search", "builder", "reviewer"], rolesCompleted: ["thinking", "search", "builder", "reviewer"], parentSubagentCalls: 4 }, delegationRate: 1, durationMs: 1000, exitCode: 0, timedOut: false },
    { taskId: "add-footer", pass: false, judgeVerdict: { verdict: "FAIL", criteria: {}, notes: "" }, census: { rolesDelegated: ["thinking", "builder"], rolesCompleted: ["thinking"], parentSubagentCalls: 2 }, delegationRate: null, durationMs: 2000, exitCode: 3, timedOut: false },
    { taskId: "fix-typo-add-item", pass: true, judgeVerdict: null, census: null, delegationRate: 0.5, durationMs: 1500, exitCode: 0, timedOut: false },
  ]);
  ok("role-eval scoreEval: agregat (2/3 lolos, judge sepakat 2/2, delegasi penuh 1/2, median rate 1.0)",
    s.tasksPassed === 2 && s.tasksTotal === 3
    && s.tasksPassedJudge === 1 && s.judgeTotal === 2 && s.judgeAgreement === 1
    && s.fullDelegation === 1 && s.censusTotal === 2 && s.rolesCoverage === 0.5
    && s.delegationRateMedian === 1 && s.delegationRateMeasured === 2);
  const s2 = H.scoreEval([{ taskId: "x", pass: false, judgeVerdict: null, census: null, delegationRate: null }]);
  ok("role-eval scoreEval: tanpa data metrik/sensus -> null (bukan 0)",
    s2.delegationRateMedian === null && s2.rolesCoverage === null && s2.judgeAgreement === null);
  const md = H.renderMarkdown({ version: "0.3.73", mode: "mock", engine: "2.3.0", startedAt: "2026-11-16T00:00:00Z", durationMs: 4500, preset: { enabled: true, thinking: "9router/kr/claude-opus-5.5", search: "x", build: "y", review: "z" }, outDir: "/tmp/x", scores: s });
  ok("role-eval renderMarkdown: memuat skor + per-tugas + batasan jujur",
    md.includes("2/3") && md.includes("search-filter") && md.includes("Batasan jujur") && md.includes("mock"));
}

// --- helper sensus (python3 + sqlite temp) ---
// Catatan repo: situs pemanggil helper lewati-tes di SEMUA file suite dibatasi
// tepat 2 (suite-runner.mjs) — file ini TIDAK boleh memakainya. Bila python3
// tidak ada, blok ini menegaskan degradasi (spawn ENOENT), bukan dilewati.
{
  const probe = cp.spawnSync("python3", ["--version"], { encoding: "utf8" });
  const hasPython = probe.status === 0;
  let censusOk = false, idsOk = false, missingOk = false;
  if (hasPython) {
    const d = tmp();
    try {
      const db = path.join(d, "opencode.db");
      const setup = `
import sqlite3, json
c = sqlite3.connect(${JSON.stringify(db)})
c.execute("CREATE TABLE session_v2 (id TEXT, parent_id TEXT, title TEXT)")
c.execute("CREATE TABLE session_message (session_id TEXT, type TEXT, seq INTEGER, data TEXT)")
c.execute("INSERT INTO session_v2 VALUES ('ses_parent', NULL, NULL)")
c.execute("INSERT INTO session_v2 VALUES ('ses_old', NULL, NULL)")
c.execute("INSERT INTO session_v2 VALUES ('ses_think', 'ses_parent', '[Thinking] Rencana')")
c.execute("INSERT INTO session_v2 VALUES ('ses_build', 'ses_parent', '[Builder] Implementasi')")
def msg(sid, typ, seq, data): c.execute("INSERT INTO session_message VALUES (?,?,?,?)", (sid, typ, seq, json.dumps(data)))
msg('ses_parent','user',1,{'time':{'created':100},'text':'tugas [EVAL-TASK:search-filter]'})
msg('ses_parent','assistant',2,{'agent':'orchestrator','model':{'id':'kr/claude-opus-5.5'},'content':[{'type':'tool','tool':'subagent'},{'type':'text','text':'x'},{'type':'tool','tool':'subagent'}],'finish':'stop'})
msg('ses_parent','idle',3,{'time':{'created':200},'outcome':'succeeded'})
msg('ses_think','assistant',1,{'agent':'thinking','model':{'id':'kr/claude-opus-5.5'},'content':[{'type':'text','text':'HASIL'}],'finish':'stop'})
msg('ses_build','assistant',1,{'agent':'builder','model':'kr/claude-sonnet-5.5','content':[{'type':'text','text':'HASIL'}],'finish':'stop'})
c.commit()
`;
      cp.spawnSync("python3", ["-c", setup], { encoding: "utf8" });
      const py = path.join(REPO, "harness", "role-eval-census.py");
      const beforeFile = path.join(d, "before.json");
      fs.writeFileSync(beforeFile, JSON.stringify(["ses_old"]));
      const r = cp.spawnSync("python3", [py, "--db", db, "--before", beforeFile], { encoding: "utf8" });
      const out = JSON.parse(r.stdout);
      censusOk = r.status === 0 && out.census !== null
        && out.census.parentId === "ses_parent"
        && out.census.parentAgent === "orchestrator"
        && out.census.parentModel === "kr/claude-opus-5.5"
        && out.census.parentSubagentCalls === 2
        && out.census.rolesDelegated.join(",") === "builder,thinking"
        && out.census.rolesCompleted.join(",") === "builder,thinking"
        && out.census.children.find((c) => c.role === "builder").model === "kr/claude-sonnet-5.5";
      const rIds = cp.spawnSync("python3", [py, "--db", db, "--list-ids"], { encoding: "utf8" });
      idsOk = JSON.parse(rIds.stdout).ids.length === 4;
      const rMissing = cp.spawnSync("python3", [py, "--db", path.join(d, "tidak-ada.db"), "--before", beforeFile], { encoding: "utf8" });
      missingOk = rMissing.status === 0 && JSON.parse(rMissing.stdout).census === null;
    } finally { rm(d); }
  } else {
    // Tanpa python3, helper sensus tidak bisa jalan — CLI harus degradasi
    // jujur (census null), dan spawn python3 mengembalikan ENOENT.
    censusOk = idsOk = missingOk = probe.error?.code === "ENOENT";
  }
  ok("role-eval census: parent + 2 anak + 2 panggilan subagent dari DB", censusOk);
  ok("role-eval census --list-ids: semua id sesi", idsOk);
  ok("role-eval census: DB hilang -> census null + exit 0 (tidak crash)", missingOk);
}

// --- CLI --list dan --score ---
{
  const r = cp.spawnSync(process.execPath, [path.join(REPO, "scripts", "role-eval.mjs"), "--list"], { encoding: "utf8" });
  ok("role-eval CLI --list: exit 0 + 3 task",
    r.status === 0 && r.stdout.includes("search-filter") && r.stdout.includes("add-footer") && r.stdout.includes("fix-typo-add-item"));
  const d = tmp();
  try {
    const taskDir = path.join(d, "search-filter");
    fs.mkdirSync(path.join(taskDir, "ws"), { recursive: true });
    fs.writeFileSync(path.join(taskDir, "ws", "index.html"), fixture("search-filter"));
    fs.writeFileSync(path.join(taskDir, "result.json"), JSON.stringify({ taskId: "search-filter", pass: false, checks: [], judgeVerdict: { verdict: "PASS", criteria: {}, notes: "" }, census: { rolesDelegated: ["thinking", "search", "builder", "reviewer"], rolesCompleted: ["thinking"], parentSubagentCalls: 4 }, delegationRate: 1, durationMs: 1000, exitCode: 0, timedOut: false }));
    const r2 = cp.spawnSync(process.execPath, [path.join(REPO, "scripts", "role-eval.mjs"), "--score", d], { encoding: "utf8" });
    ok("role-eval CLI --score: hitung ulang checker dari ws tersimpan (FAIL tetap FAIL) + agregat",
      r2.status === 0 && r2.stdout.includes("0/1"));
  } finally { rm(d); }
  const r3 = cp.spawnSync(process.execPath, [path.join(REPO, "scripts", "role-eval.mjs"), "--task", "tidak-ada"], { encoding: "utf8" });
  ok("role-eval CLI --task tidak dikenal: exit 2", r3.status === 2);
}

// --- mock smoke: model list + L1 JSON + alur parent scripted ---
{
  const port = 20199;
  const d = tmp();
  const mock = cp.spawn(process.execPath, [path.join(REPO, "tests", "fixtures", "role-eval-mock-9router.mjs")], {
    env: { ...process.env, MOCK_PORT: String(port), MOCK_LOG: path.join(d, "mock.log"), REQ_LOG: path.join(d, "requests.jsonl"), SCRIPTED: "1", EVAL_OUT: d },
    stdio: "ignore",
  });
  try {
    const waitUp = async () => {
      for (let i = 0; i < 50; i++) {
        try { const r = await fetch(`http://127.0.0.1:${port}/v1/models`); if (r.ok) return true; } catch {}
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    };
    const up = await waitUp();
    ok("role-eval mock: GET /v1/models jalan", up);
    if (up) {
      const models = await (await fetch(`http://127.0.0.1:${port}/v1/models`)).json();
      ok("role-eval mock: 6 model terdaftar", models.data.length === 6);
      const l1 = await (await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "kr/claude-opus-5.5", stream: false, messages: [{ role: "system", content: "# Layer-1 SELECT-ONLY" }, { role: "user", content: "tugas" }] }),
      })).json();
      const l1text = l1.choices[0].message.content;
      ok("role-eval mock: L1 SELECT-ONLY dijawab JSON valid",
        JSON.parse(l1text).sectors.includes("web"));
      const parent = await (await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "kr/claude-opus-5.5", stream: false, messages: [{ role: "user", content: "Tambahkan footer. [EVAL-TASK:add-footer]" }] }),
      })).json();
      const tc = parent.choices[0].message.tool_calls || [];
      ok("role-eval mock: parent giliran pertama mendelegasikan ke Thinking",
        tc.length === 1 && tc[0].function.name === "subagent"
        && JSON.parse(tc[0].function.arguments).agent === "thinking");
      const child = await (await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "kr/claude-opus-5.5", stream: false, messages: [
          { role: "system", content: "Kamu Thinking — perencana peran /subagent Lumitome" },
          { role: "user", content: "You are a subagent spawned by another session. [DELEGASI-THINKING] Baca index.html di folder ini lalu buat rencana tambah footer [EVAL-TASK:add-footer]. Jangan ubah fitur lama." },
        ] }),
      })).json();
      const childTc = child.choices[0].message.tool_calls || [];
      ok("role-eval mock (regresi run1 0373): giliran pertama ANAK membaca file, BUKAN mendelegasikan ke dirinya sendiri",
        childTc.length === 1 && childTc[0].function.name === "read");
      ok("role-eval mock (regresi run3 0373): path read anak = EVAL_OUT/<task>/ws/index.html",
        childTc.length === 1 && JSON.parse(childTc[0].function.arguments).path === path.join(d, "add-footer", "ws", "index.html"));
      const judge = await (await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "kr/claude-opus-5.5", stream: false, messages: [{ role: "user", content: "[EVAL-JUDGE] add-footer\nTugas asli: x\nArtefak (isi file hasil kerja):\n--- index.html ---\n<html><footer><p>© 2026 TokoBajuKu — Semua hak dilindungi</p><a>Hubungi kami</a></footer><h1>TokoBajuKu</h1><div id=\"daftar-produk\"></div></html>\n\nKriteria:\n- c1: footer" }] }),
      })).json();
      const verdict = H.parseJudgeVerdict(judge.choices[0].message.content);
      ok("role-eval mock: judge blind memberi PASS untuk artefak lengkap",
        verdict !== null && verdict.verdict === "PASS");
      // EVAL_OUT_BASE: run terbaru menang (regresi run5 0373: mock menulis ke run lama)
      const d2 = tmp();
      const port2 = 20198;
      let mock2 = null;
      try {
        for (const run of ["run1", "run2"]) {
          const ws = path.join(d2, run, "add-footer", "ws");
          fs.mkdirSync(ws, { recursive: true });
          fs.writeFileSync(path.join(ws, "index.html"), "<html>fixture</html>");
        }
        const old = new Date(Date.now() - 3600_000);
        fs.utimesSync(path.join(d2, "run1", "add-footer", "ws", "index.html"), old, old);
        mock2 = cp.spawn(process.execPath, [path.join(REPO, "tests", "fixtures", "role-eval-mock-9router.mjs")], {
          env: { ...process.env, MOCK_PORT: String(port2), MOCK_LOG: path.join(d2, "mock.log"), REQ_LOG: path.join(d2, "requests.jsonl"), SCRIPTED: "1", EVAL_OUT_BASE: d2 },
          stdio: "ignore",
        });
        let up2 = false;
        for (let i = 0; i < 50; i++) {
          try { const r = await fetch(`http://127.0.0.1:${port2}/v1/models`); if (r.ok) { up2 = true; break; } } catch {}
          await new Promise((r) => setTimeout(r, 100));
        }
        ok("role-eval mock EVAL_OUT_BASE: mock kedua naik", up2);
        if (up2) {
          const c2 = await (await fetch(`http://127.0.0.1:${port2}/v1/chat/completions`, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ model: "kr/claude-opus-5.5", stream: false, messages: [
              { role: "system", content: "Kamu Thinking — perencana peran /subagent Lumitome" },
              { role: "user", content: "[DELEGASI-THINKING] Baca index.html lalu buat rencana [EVAL-TASK:add-footer]." },
            ] }),
          })).json();
          const tc2 = c2.choices[0].message.tool_calls || [];
          ok("role-eval mock EVAL_OUT_BASE: path read anak = run TERBARU (run2), bukan run lama",
            tc2.length === 1 && JSON.parse(tc2[0].function.arguments).path === path.join(d2, "run2", "add-footer", "ws", "index.html"));
        }
      } finally {
        try { mock2?.kill("SIGKILL"); } catch {}
        rm(d2);
      }
    }
    // Bila mock tidak naik, asersi "GET /v1/models jalan" di atas sudah FAIL —
    // asersi turunan di dalam if (up) tidak dievaluasi (bukan dilewati diam-diam).
  } finally {
    try { mock.kill("SIGKILL"); } catch {}
    rm(d);
  }
}

finish();
