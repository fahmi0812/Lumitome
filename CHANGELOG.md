# Changelog

## Unreleased (Wave 0 — Lumitome Next)

- **Single-Source Config (`lumitome/lib/default-config.mjs`):** `lumitome/config/opencode.jsonc` dan root `opencode.jsonc` kini disinkronkan pada `limit` (`1048576`/`65536`), `compaction` (`auto: true`, `keep.tokens: 24000`, `buffer: "10%"`), `tool_output` (`max_lines: 400`, `max_bytes: 16384`), serta variabel `{env:LUMI_9ROUTER_URL}` dan `{env:LUMI_KEY_9ROUTER}` (divalidasi otomatis oleh `npm run validate`).
- **Pembalikan presedensi & deprecasi `SW_* → LUMI_*` (`lumitome/lib/env-compat.mjs`):**
  - **`LUMI_*` kini selalu menang atas `SW_*`** di seluruh wrapper, router, dan skrip (`LUMI_HOME > SW_HOME` di `engine.mjs`, `lumitome.mjs`, dan `scripts/doctor.sh`; `LUMI_9ROUTER_URL > SW_9ROUTER_URL`; `LUMI_KEY_9ROUTER > LUMI_9ROUTER_KEY > SW_9ROUTER_KEY > NINEROUTER_API_KEY`). Perubahan dari perilaku lama (`router/skill-db.mjs` & `doctor.sh` yang sebelumnya mendahulukan `SW_*`).
  - **Aturan `??` vs `||`:** `LUMI_EMBED_MODEL=""` sekarang menonaktifkan embedding secara eksplisit (`none`) tanpa fallback ke `SW_EMBED_MODEL`; sebaliknya kredensial dan URL tetap melewati string kosong `""` ke alias berikutnya.
  - Alias `SW_*` masih diterima dengan peringatan deprecasi 1× per proses ke `stderr` (`[lumitome] DEPRECATED: ... akan dihapus di v0.5.0`). Nama server MCP `swanwright-skills` diperbarui menjadi `lumitome-skills` / `lumitome-skills-${sector}`.

## 0.3.85 — fix: limit.context model diteruskan dari 9router — auto-compact 90% kini jalan di jendela asli

- **Bug: auto-compact proaktif tidak pernah terpicu.** `detectModels()` hanya mengambil id model dari `GET /v1/models` 9router dan `opencodeFragment()` mendaftarkan model tanpa `limit` — engine lalu default `limit.context` 0, rumus ceiling `lm(limit, buffer)` jadi Infinity, jadi auto-compact (alasan "auto") tidak jalan sebelum overflow. Yang 90% di v0.3.83 itu benar sebagai setting, tapi tidak pernah mencapai angka jendela model yang sebenarnya.
- **Fix: limit diteruskan dari server.** `detectModels()` kini menangkap `context`/`output` per model (`capabilities.contextWindow`/`maxOutput` didahulukan, lalu `context_length`/`max_completion_tokens`, lalu `context_window`/`max_model_len`; nilai tidak valid diabaikan), disimpan di `providers.json` berdampingan dengan daftar id, dan `opencodeFragment()` mengirimnya sebagai `limit: { context, output }` ke engine. `refresh()` ikut menyegarkan limit; server yang berhenti melapor limit menghapus map basi. `models` tetap string[] — tidak ada pembaca lama yang berubah, dan providers.json lama tanpa `limits` tetap jalan (tanpa limit, seperti dulu).
- **Fallback di config dasar.** Model default `ag/gemini-3.8-flash-high` kini membawa `limit: { context: 1048576, output: 65536 }` di `lumitome/config/opencode.jsonc` (terverifikasi dari 9router `capabilities.js` pola `*gemini-3.8*`; pola `*gemini-4*` sama: 1048576/65536). Nilai hidup tetap dari server saat runtime — angka statis ini hanya fallback bila fragment belum ada limit.
- **Hasil:** dengan `buffer: "10%"`, auto-compact kini terpicu di 90% jendela asli model — 943.718 token untuk model 1M (sebelumnya: tidak terpicu, atau fallback cap internal engine 200K → 180K). Tes baru +5 `ok()` di `tests/suite-providers.mjs` (deteksi, simpan + fragment, kompatibel mundur, refresh, config dasar).

## 0.3.84 — skill: modern-web-guidance dari GoogleChrome

- **Skill `modern-web-guidance` terpasang.** Dari repo GoogleChrome/modern-web-guidance: hanya `SKILL.md` yang disalin ke `.opencode/skills/modern-web-guidance/` (SHA pin `2b4aa13a`), didaftarkan di registry (930 → **931**). Skill ini wajib jalan duluan untuk tugas HTML/CSS/JS sisi klien, karena API web berubah cepat dan bobot latih model bisa berisi pola usang.
- **210 panduan `guides/` tidak disalin.** Tetap diakses saat dibutuhkan lewat CLI `npx -y modern-web-guidance@latest` (`harness/mwg-consult.mjs`), seperti yang sudah dirujuk skill `loopdesign` dan `stitch-ui` selama ini — repo tetap ringan.
- **Catatan:** pemasangan ini atas perintah Fahmi yang membatalkan larangan "jangan salin file MWG ke repo" di SKILL.md `loopdesign` untuk tugas ini; teks larangan itu sendiri tidak diubah.

## 0.3.83 — compaction: auto-compact di 90% jendela konteks

- **Default auto-compact kini 90%.** `compaction.buffer` di config dasar berubah dari `20000` (token) menjadi `"10%"` — bagian jendela konteks yang disisakan kosong, jadi auto-compact mulai begitu percakapan mencapai 90% jendela (di 256K = 230.400 token). Sebelumnya buffer token tetap berarti ambang persennya berubah-ubah tiap model (di 256K baru mulai di 92,2%). `keep.tokens` tetap 24000.
- **Skema + migrasi ikut.** `scripts/schema/opencode-config.schema.json` kini menerima buffer integer ATAU string persen (`"10%"`); migrasi config lama (`lumitome/lib/config-migrate.mjs`) mengubah nilai default lama (`"20%"` dan `20000`) menjadi `"10%"`, nilai pilihan user tidak disentuh. Tes diperbarui (+2 `ok()` di `tests/suite-providers.mjs`: migrasi 20000 → `"10%"` dan buffer user tidak disentuh).

## 0.3.82 — Audit: paket lebih kecil, instal ke rilis bertag, CI, dokumen rapi

- **Instal memasang rilis, bukan ujung `main`.** `install.sh` mode remote (`curl | bash`) kini mencari tag `vX.Y.Z` tertinggi (git `ls-remote`, atau GitHub API `releases/latest` tanpa git) lalu `git clone --branch <tag>` / tarball `archive/refs/tags/<tag>.tar.gz`. `LUMI_REF` menimpa (tag lain, atau `main` untuk versi pengembangan). Gagal menentukan rilis: instalasi baru berhenti jelas dengan saran `LUMI_REF`; instalasi lama lanjut dengan sumber lama + WARN. README: semua baris `npm install -g` memakai URL tag. +6 tes installer.
- **61 salinan skill duplikat dihapus (−50 MB repo, 12.711 → 11.094 file).** Folder cermin `<nama>-N` yang upstream-nya sama dengan folder dasarnya (24× `impeccable-N`, 26 salinan universal-modder di gamedev, 6× `*-2` ui-ux-pro-max, dll.) tidak pernah di-route. 5 cermin dari upstream berbeda (`ink-2`, `skill-creator-2`, `tdd-2`, `teach-2`, `apk-reverse-2`) disimpan. Registry tetap 930 (764 route). Hitungan NOTICE disesuaikan. Paket npm 159 → 144 MB; `.coverage`/`__pycache__` dikeluarkan dari paket.
- **CI** (`.github/workflows/ci.yml`): lint + `validate:offline` + tes di setiap push ke `main` dan PR.
- **Tes lebih mudah didiagnosis.** Setiap `[FAIL]` kini mencetak `file:baris`, potongan sumber asersi, dan `detail` opsional. Helper baru `okEach(nama, {label: kondisi})` menyebut bagian mana yang gagal; asersi versi 9-kondisi di suite-services memakainya.
- **Dokumen:** README ditulis ulang (paragraf raksasa dipecah, bagian "Safety model" baru yang jujur soal mode auto + tanpa sandbox); detail `/subagent` pindah ke `docs/SUBAGENT.md`. CHANGELOG 273 → 41 KB: versi sebelum 0.3.70 diarsipkan per sepuluh versi di `docs/changelog/` (isi dipindah apa adanya; satu heading 0.3.66 kosong dobel dibuang). `docs/SKILLS-CATALOG.md` (basi sejak v0.1.1: 687 skill) kini dibangkitkan `npm run skills:catalog` dari registry dan dijaga `validate`.
- **AGENTS.md** tidak lagi mengizinkan push ke `main`; kini sama dengan guard (`push-main`) dan rules agen.
- **`bump-version.mjs`** mengecek semua pola sebelum menulis apa pun (dulu gagal di tengah meninggalkan VERSION sudah naik) dan mengganti semua URL tarball tag di README.
- **Sisa nama Swanwright:** plugin `.opencode/plugins/swanwright.ts` → `lumitome-harness.ts` (id `lumitome-harness`; doctor ikut), deskripsi perintah, deskripsi tool `skill_search`, user-agent router, header harness, dan judul dokumen. Dokumen Swanwright lama diberi label historis. Yang sengaja tetap: variabel `SW_*`, kunci frontmatter `swanwright_*` (dipakai ~900 SKILL.md vendor dan basis merge 3-arah sync upstream), dan LICENSE.
- **Catatan rilis:** tag `v0.3.80` dan `v0.3.81` tidak pernah dibuat, jadi `lumitome update` dan installer berhenti di v0.3.79. Push tag `v0.3.82` agar versi ini sampai ke pengguna.

## 0.3.81 — loopdesign: cara berpikir space (negative space)

- Skill `loopdesign` kini memasang cara berpikir space: Maker tulis
  `Ruang:` di `DESIGN.md` (area kosong utama + apa yang sengaja
  dikurangi) sebelum bangun, dengan aturan kurangi dulu, tambah
  belakangan — ruang kosong itu keputusan, bukan sisa; kosong ≠ belum
  selesai; satu layar, satu hal utama; kalau layout terasa padat
  seperti poster AI, kurangi, jangan poles.
- File baru `.opencode/skills/loopdesign/references/space.md`:
  definisi negative space ("ruang untuk bernapas") dari reel attar.psd
  ("tukang desain", 23 Agu 2026, 140,3 rb like — poster Chicken
  D'Mai yang dikurangi brush/elemen/warnanya jadi lebih enak dilihat;
  layout padat X vs lega centang). Ditegaskan jujur: reel tidak memberi
  angka padding/margin/grid — angka jarak tetap di `unslop-tokens.md`
  § "Skala spacing". Kritikus dapat checklist space 4 item (advisory,
  bukan gate) di loopdesign §3.
- Gate deterministik baru di `harness/design-gate.mjs` (v0.3.81):
  `space-density` (warn saja, tidak pernah fail) bila ruang kosong
  terukur <10% viewport. Ruang kosong diukur di
  `harness/design-measure.mjs` (grid 24×14 `elementFromPoint`,
  agregat minimum antar viewport) dan `parseDesignFile` kini membaca
  `Ruang:`, yang ikut dikirim ke kritikus lewat `criticInput`
  (direction). Probe fixture: ruang kosong terendah 0.714 (token-clean
  di 390px) — jauh di atas ambang 0.10, jadi red-test lama aman
  (fixed tetap 0 findings, bounce-easing tetap 2, unslop-signs tetap 9).
- Validasi + tes: `validate` 19 PASS (warns 0), suite 1223/0/1
  (baseline v0.3.80 di mesin ini, Chrome headless-shell yang sama,
  1219/0/1 → +4 tes baru), `lint` OK.
  Tes baru: 4 `ok()` di `tests/suite-design.mjs` + 1 baris `Ruang:` di
  fixture `tests/fixtures/design/DESIGN-taste.md`.

## 0.3.80 — loopdesign: cara berpikir taste warna

- Skill `loopdesign` kini memasang cara berpikir taste warna, bukan
  sekadar daftar hex: Maker tulis `Rasa:` dulu di `DESIGN.md` sebelum
  memilih hex, lalu `Palet:` (id dari
  `design-taste-frontend/library/palettes.json` — 56 palet terkurasi —
  atau "merek sendiri") dengan peran `Dominan 60% / Sekunder 30% /
  Aksen 10%` + `Field:` opsional. Aturan deal palet: dilarang mengarang
  4–6 token dari kepala tanpa rujukan. Rekonsiliasi angka ditulis
  jujur di skill: 60-30-10 adalah rasio perencanaan brand/landing,
  sedangkan di layar app aksen terukur <5% per layar (taste
  `colour.md` §3) dan Ground 70–90% — keduanya dipakai, bukan dipaksa
  satu angka.
- File baru `.opencode/skills/loopdesign/references/color-feel.md`:
  tabel rasa → palet dari reel winkhsin (Winson Kho, 11 Nov 2026 —
  biru langit + putih = lega, krim + espresso = hangat, hitam + putih
  = tegas/profesional, court blue + putih = sporty/clean, scarlet =
  berani/cepat booking, oranye = energik) + contoh palet dari
  `palettes.json` + contoh hitung 60-30-10. Ditegaskan sebagai panduan
  persepsi, BUKAN hukum sains dan BUKAN aturan gate. Kritikus dapat
  checklist warna 7 item (advisory, bukan gate) di loopdesign §3.
- Gate deterministik baru di `harness/design-gate.mjs` (v0.3.80):
  `banned-palette` (fail bila ground krim jenuh + aksen terracotta
  bersamaan — definisi HSV supaya pasangan Kopi Senja `#FFF8F0 +
  #A0591E` yang sudah disetujui tetap lolos) dan `accent-share`
  (warn bila aksen >10% luas terukur, fail bila >25%). Luas warna
  diukur di `harness/design-measure.mjs` (area rect per warna,
  dijumlahkan per rgb) dan `parseDesignFile` kini membaca `Rasa`,
  `Palet`, peran Dominan/Sekunder/Aksen, `Field`, yang ikut dikirim ke
  kritikus lewat `criticInput` (direction). `allow` mengecualikan
  kedua cek bila brief/merek memang meminta.
- Validasi + tes: `validate` 19 PASS (warns 0), suite 1190/0/2
  (baseline v0.3.79 di mesin ini 1184/0/2 → +6 tes baru), `lint` OK.
  Tes baru: 6 `ok()` di `tests/suite-design.mjs` + fixture
  `tests/fixtures/design/DESIGN-taste.md`.

## 0.3.79 — Startup tenang saat /subagent OFF

- Peringatan startup `lumitome: PERINGATAN — model default sesi TUI
  jatuh ke default terpin` tidak lagi tercetak di setiap launch saat
  sistem /subagent OFF. Fallback ke default terpin dalam keadaan OFF
  itu DIHARAPKAN (sesi memang memakai default terpin), bukan kebocoran
  — sebelumnya kondisi peringatan terpenuhi di setiap launch padahal
  tidak ada yang salah.
- Cara kerja: `resolveSessionDefault` (scripts/apply-subagent-preset.mjs)
  menandai cabang OFF dengan `expected: true`; wrapper
  (lumitome/bin/lumitome.mjs, blok TUI dan `run` headless) hanya
  bersuara bila fallback TIDAK expected. Alasan string tidak berubah;
  jalur diagnosis tetap ada: `lumitome subagent-preset status`
  menampilkan model default + alasannya.
- Yang TETAP bersuara (proteksi LEAK #2 v0.3.76, tidak diubah):
  fallback tak terduga — tanpa preset, model Thinking tidak valid,
  cache providers.json tidak bisa dibaca, atau Thinking tidak ada di
  cache live. Peringatan LUMI_TRUST_PROJECT / tier env, preflight
  `run`, dan `lumitome: auto-index started` juga tidak diubah.
- Validasi + tes: `validate` 19 PASS (warns 0), suite 1184/0/2
  (baseline v0.3.78 di mesin ini 1181/0/2 → +3 tes baru: OFF →
  `expected: true`; ON + Thinking di cache → Thinking; ON + Thinking
  tidak di cache → pinned + `expected` falsy), `lint` OK, gitleaks
  PASS. Bukti perilaku (probe jalur resolusi wrapper dengan LUMI_HOME
  sementara berisi preset OFF): kondisi peringatan TRUE sebelum
  perbaikan, FALSE sesudahnya.

## 0.3.78 — Tableau MCP (opt-in sektor riset)

- Daftarkan `@tableau/mcp-server` (Tableau resmi, Apache-2.0, pin
  `6.0.4`) sebagai MCP opt-in sektor riset — mati default, hanya bila
  disebut eksplisit di `LUMI_MCP` (tidak ikut `all`): entri
  `router/mcp-sectors.json` (kind `direct`, risk `S`, `ask` 13 pola),
  blok opt-in di `lumitome/lib/build-config.mjs` (npx terpin, env PAT
  via `environment`, timeout 30/30/300 detik), entri `opencode.jsonc`
  (`disabled: true`), dan baris `docs/MCP.md`.
  Alasan pin 6.0.4: npm `latest` saat ini (rilis 2026-11-09); 6.5.2 di
  main upstream masih Unreleased (dicek 2026-11-19).
- Koreksi fakta upstream: tool Web = 55, bukan 56 (dihitung ulang dari
  `toolName.ts` v6.0.4 + cross-check bundle npm); pola `ask` memakai
  `-`, bukan `_` — dibuktikan dari kode engine OpenCode 2.3.0
  (`normalizedName` mempertahankan strip), jadi `publish_*` akan gagal
  cocok dengan `publish-workbook` asli.
- Skill baru `tableau` (sektor riset): cari workbook/view, baca
  metadata datasource, query data, ambil data & gambar view, baca
  Pulse metrics — dengan batas jujur (Web-only, konten harus sudah
  ter-publish, file `.twb`/`.twbx` lokal tidak bisa dibuka, Desktop
  authoring di luar cakupan, PAT kedaluwarsa setelah 15 hari tidak
  dipakai, tool tulis = ask).
- Validasi + tes: `npm run policy` (agen riset dapat aturan
  `tableau_*` allow + 13 ask), `validate` 19 PASS (warns 0), suite
  1181/0/2 (baseline v0.3.77 di mesin ini 1180/0/2 → +1 tes tableau
  baru).
- UNVERIFIED (butuh kredensial Tableau Fahmi): tes baca live
  (`list-workbooks`, `get-datasource-metadata`, `query-datasource`)
  dan katalog `tableau_*` live — server menolak start tanpa Tableau
  yang terjangkau (probe kredensial dummy gagal TLS sebelum
  `tools/list`).

## 0.3.77 — PlatformIO MCP (PIO Agent)

- Daftarkan `platformio-mcp` (PIO Agent, `jl-codes`, MIT, pin
  `platformio-mcp@3.1.0`) sebagai MCP opt-in sektor coding — mati
  default, hanya bila disebut eksplisit di `LUMI_MCP` (tidak ikut
  `all`): entri `router/mcp-sectors.json` (kind `direct`, risk `S`,
  `ask: upload_*, agent_flash_monitor_verify, reset_server_state`),
  blok opt-in di `lumitome/lib/build-config.mjs` (pola drawio: npx
  terpin, stdio `serve`, timeout 30/30/300 detik), entri
  `opencode.jsonc` (`disabled: true`), dan baris `docs/MCP.md`.
  Alasan pin 3.1.0: npm `latest` saat ini; 3.2.0 di repo upstream
  masih Unreleased (dicek 2026-11-18).
- Skill baru `platformio` (sektor coding, CLI-first): validasi proyek,
  diagnosa build terstruktur, audit pin GPIO ESP32, flash +
  verifikasi serial — dengan batas jujur (flash butuh board fisik +
  approval; tier standard/trusted bukan strict; tanpa sudo; jangan
  profil `standalone`/`lab_admin`; jangan tebak target).
- Validasi + tes: `npm run policy` (agen coding dapat aturan
  `platformio_*` allow + `ask` tulis/flash), `validate` OK (warns 0),
  suite hijau (lihat laporan `~/workspace/lumitome-v0.3.77-report.md`).
- UNVERIFIED (butuh mesin Fahmi + board nyata): install
  `platformio-mcp@3.1.0` + PlatformIO Core (`pio` di PATH), build
  contoh ESP32, flash + `agent-flash-monitor-verify`, akses serial di
  tier standard/trusted, dan penolakan build/flash di luar workspace
  oleh policy default platformio-mcp.

## 0.3.76 — Perbaiki kebocoran model /subagent (LEAK #1, #2, #3, #5)

- Latar: laporan diagnosis lapangan Fahmi (Linux, v0.3.71) — preset di disk
  sudah benar tapi 4/4 sesi anak tetap jalan dengan model basi dari cache
  daemon; fallback ke default gemini terjadi diam-diam; footer file agent
  menyebut lokasi preset yang salah; metrik tidak mencatat model anak.
  Skenario auditor direproduksi dulu di VM (engine 2.3.0, mock 9router):
  SEBELUM perbaikan anak tugas-2 4/4 memakai model preset lama (REPRO-BOCOR);
  SESUDAH perbaikan 4/4 memakai model preset baru (FIXED) — bukti di
  `~/workspace/lumitome-test-0376/` (`results-0376-repro-BEFORE.json` vs
  `results-0376-repro.json`).
- A (LEAK #1): plugin server TIDAK lagi melewati sesi anak di
  `maybeSwitchNewSession` — sesi anak peran (thinking/search/builder/
  reviewer) dialihkan ke `preset.roles[agent].model` lewat
  `ctx.session.switchModel` saat `session.created` (keputusan murni
  `childSessionModel()` di `flow.mjs`; hasil switch dicatat ke metrik
  `child-switch` / `child-switch-failed`). Spike live TERBUKTI: switch pada
  sesi anak diizinkan engine 2.3.0 dan tiba tepat waktu — cache daemon
  masih basi (P1) tapi anak tugas-2 tetap jalan P2 (8 switch, 0 gagal).
- B (LEAK #1): sidik service (`lumitome/bin/lumitome.mjs`) kini ikut
  menghitung hash isi preset + baris `model:` 4 file agent
  (`presetAgentHash()` di `lumitome/lib/service-ctl.mjs`) — TUI baru
  sesudah ganti preset tidak me-reuse daemon basi (ensureFresh → restart).
  Bukti modul-level: `test-fingerprint-live.mjs` 3/3 (reuse bila sidik sama;
  sidik berubah bila preset berubah; restart + service basi mati).
- C (LEAK #2): fallback ke `DEFAULT_MODEL` kini BERSUARA — peringatan
  stderr SELALU (tanpa syarat `LUMI_DEBUG`) + alasan, untuk sesi TUI
  maupun `lumitome run` headless (preset meminta Thinking lain). Perilaku
  fallback tidak berubah (tetap memakai default yang aman).
- D (LEAK #3): footer 4 file agent diperbaiki — model dari frontmatter
  `model:`, disinkron dari preset `$LUMI_HOME/lumitome-subagent.json`
  (bukan "model 9router default", bukan `.opencode/lumitome-subagent.json`).
  Footer ini teks statis (applyPreset hanya menulis baris `model:`,
  gen-policy hanya menulis frontmatter) — tidak ada generator yang diubah.
  README + ARCHITECTURE.md diselaraskan (anak peran kini dialihkan di
  tengah sesi; sidik daemon ikut preset).
- E (LEAK #5): metrik kini mencatat kelahiran sesi anak
  (`child-session`: sessionID, parentID, agent, model awal),
  peran target panggilan subagent (`targetAgent` di baris tool), dan
  ringkasan per (peran, model) di `lumitome subagent-metrics`
  (baris `child-session` kembar dari engine di-dedupe per sessionID).
- TIDAK diperbaiki (jujur): LEAK #4 penuh — isolasi preset per-sesi TUI
  tetap tidak ada (satu preset file, satu folder agent, satu daemon);
  mitigasi: jangan jalankan dua TUI dengan preset berbeda; restart TUI
  sesudah ganti preset di TUI lain. Kontaminasi konteks engine/9router
  (reviewer mengaku thinking) tidak bisa diperbaiki di repo ini.
  Catatan engine: `session.created` dikirim DUA kali per sesi anak
  (baris metrik kembar, timestamp identik) — switch idempotent jadi tidak
  berbahaya; `summarize()` menduplikasi baris `child-session` kembar.
- Tes: `npm run validate` OK (warns 0); suite **1179/0/2** (+11 regresi:
  childSessionModel, presetAgentHash + wrapper, footer, metrik + dedupe,
  gates A/C). Dua tes lama yang mengunci perilaku lama diperbarui dengan
  sengaja (v0.3.65 switchModel kini lewat helper + anak dialihkan;
  v0.3.71 A2 peringatan fallback kini tanpa syarat LUMI_DEBUG).
  Secret scan: gitleaks UNRUN (biner tidak ada di VM); grep manual pola
  rahasia di diff — bersih (satu-satunya cocok: nama env
  `NINEROUTER_API_KEY` di pesan error lama, bukan nilai).

## 0.3.75 — Parallel MCP opt-in — web search untuk Search role (P4 lanjutan)

- Baru (opt-in, OFF by default): MCP **Parallel** (`https://mcp.parallel.ai/mcp`,
  remote) untuk Search role — `web_search`, `web_fetch`, `web_decisions`,
  `find_verticals`, `search_vertical`, `image_search`, `send_feedback`
  (+ `web_research` bila pakai API key). Alasan: Search role sampai hari ini
  TIDAK punya tool pencarian web sama sekali — izinnya hanya context7
  (dokumen library) + codemem (memori codebase lokal); prompt-nya bilang
  "cari web" tapi untuk info live ia harus menebak dari data latih atau
  lapor BLOCKED. Playwright (sektor riset) adalah otomasi browser — berat,
  lambat, boros token — bukan API search; markitdown butuh URL dulu.
  Parallel menutup kekurangan itu tanpa menggusur apa pun.
- Cara pakai: `LUMI_MCP=<default>,parallel` lalu restart service (tanpa key
  pun jalan — tier gratis anonim). Opsional, untuk `web_research` + limit
  lebih tinggi: buat key di platform.parallel.ai lalu
  `PARALLEL_API_KEY=<key>` di env proses (key TIDAK PERNAH masuk config —
  hanya literal `{env:PARALLEL_API_KEY}` sebagai header
  `Authorization: Bearer`, mengikuti aturan secret repo; tanpa key, header
  tidak dikirim). Harga berbayar (bila pakai key): search fast/turbo
  $1/1.000 req, basic/advanced $5/1.000, extract $1/1.000 URL, decisions
  $1/1.000, web_research dari $10/1.000; limit anonim "variable, cukup
  untuk personal use" (tanpa angka pasti — overage = rate-limit, bukan tagihan).
- Perubahan (minimal, pola opt-in figcraft/blender): entri `parallel` di
  `router/mcp-sectors.json` (sektor riset + agents.search) → `npm run policy`
  meregenerasi izin Search (`parallel_*` allow) + `sectors/riset.md`; blok
  opt-in di `lumitome/lib/build-config.mjs` (hanya bila `LUMI_MCP`
  menyebut `parallel` eksplisit — TIDAK ikut `all`); blok disabled di
  `opencode.jsonc`; `docs/MCP.md` + `ARCHITECTURE.md` §3; `check-opencode`
  + `validate` (pesan pass). Body teks Search role TIDAK diubah. Tes baru
  (3) di `tests/suite-services.mjs`: tanpa key → remote + URL benar + TANPA
  header; dengan `PARALLEL_API_KEY` → header `{env:...}` + nilai key tidak
  muncul di config; `LUMI_MCP=all` → parallel TIDAK ikut.
- Verifikasi (VM, engine 2.3.0, tanpa key): probe MCP langsung —
  `tools/list` 7 tool + `web_search` asli mengembalikan hasil nyata
  (info rilis OpenCode v2.3.0); `opencode mcp list` → `✓ parallel
  connected`. E2E lewat engine (mock 9router, orchestrator → subagent
  Search): TERBUKTI eksekusi nyata — Search child menerima hasil Parallel
  asli (`search_id: search_94ce41903f9f6474695fcfea176100cf`, excerpts halaman
  rilis OpenCode incl. v2.3.0 13 Nov 2026), lalu parent menerima HASIL-nya.
  Gates: validate OK (warns 0, lint 70 file), suite **1168/0/2** (+3).
- Batasan jujur: (1) Engine 2.3.0 TIDAK menawarkan tool MCP sebagai
  function call langsung ke model — toolDefs sesi Search hanya 7 tool
  built-in; jalur pemanggilan yang didokumentasikan engine sendiri
  (`<mcp_instructions>`) adalah lewat tool `execute` (Code Mode JS):
  `tools["parallel"].web_search(...)` — dan E2E di atas membuktikan jalur
  itu bekerja. Model nyata akan memakai jalur yang sama (instruksi sudah
  ada di system prompt-nya). (2) Live dengan API key asli BELUM teruji —
  hanya config (header `{env:...}`, key tidak bocor). (3) Limit tier gratis
  anonim tidak dipublikasi angkanya ("variable"); privasi: query search
  dikirim ke server parallel.ai, tier Launch TIDAK tercakup SOC 2 dan tanpa
  ZDR default — opt-in saja, pengguna yang memilih. (4) `web_decisions`
  masih early-release; `send_feedback` adalah write outbound ke pihak
  ketiga (bagian dari tool set default vendor). Bukti lengkap:
  `~/workspace/lumitome-test-0375/NOTES.md`.

## 0.3.74 — Plugin TUI /subagent gagal load di Windows — bawa react sendiri

- Perbaiki: plugin TUI /subagent gagal load di install npm-global Windows
  (`Cannot find package 'react'` dari `tui.tsx`) — plugin kini membawa react
  sendiri: `"react": "19.3.1"` (pin eksak) di `dependencies` root + entri
  lockfile. `npm install -g` (fresh install maupun `lumitome update` mode
  npm) memasangnya otomatis ke `node_modules` paket; tidak ada perubahan
  jalur update/install.
- Akar masalah (TERBUKTI di VM, bukan asumsi): `tui.tsx` berisi JSX Stage B
  (baris 296) → engine (Bun) mentranspile `.tsx` dengan automatic JSX
  runtime default (`jsxImportSource: "react"`) sehingga menyuntikkan import
  `react/jsx-runtime`. File plugin di DALAM `node_modules` (layout
  npm-global) di-resolve filesystem-only → tidak ada react di parent
  node_modules mana pun → gagal. File di LUAR `node_modules` (layout repo)
  memakai react/jsx-runtime dari bundle engine yang ter-embed → lolos.
  Inilah sebabnya VM tidak pernah menangkap bug ini dan mengapa upgrade
  engine 2.2.4 → 2.3.0 di Windows tidak mengubah apa pun (bukan soal versi
  engine).
- Bukti isolasi (probe plugin minimal, layout npm-global): hanya-JSX gagal
  react; hanya-`@opencode/plugin/tui` lolos; hanya-`solid-js` lolos;
  probe-JSX di jalur repo gagal `No renderer found` (react ter-resolve);
  salinan paket di jalur biasa (bukan `node_modules`) lolos.
- Verifikasi (VM, engine 2.3.0, simulasi layout npm-global):
  sebelum perbaikan palet `Subagent roles` TIDAK ada + log
  `Cannot find package 'react'` (plugins=14); sesudah perbaikan palet ADA,
  0 `Cannot find package`, `plugins=15`, 0 WARN plugin. Gates: validate OK
  (warns 0, lint 70 file), suite 1165/0/2 (sama seperti v0.3.73).
- Batasan jujur: belum teruji di Windows ASLI Fahmi — hanya simulasi layout
  npm-global di VM (Linux). Perintah sesudah rilis: `lumitome update`
  (atau `npm install -g .../tarball/v0.3.74`); `lumitome upgrade` TIDAK
  perlu (engine sudah 2.3.0). Bukti lengkap:
  `~/workspace/lumitome-test-0374/NOTES.md`.

## 0.3.73 — Eval harness peran /subagent (P4)

- Baru: eval harness peran (`harness/role-eval.mjs`, `scripts/role-eval.mjs`,
  `lumitome role-eval`) — 3 golden task deterministik kecil (search-filter,
  add-footer, fix-typo-add-item) + checker file murni + blind judge (hanya
  artefak hasil kerja, tanpa transkrip/diagnosis — protokol blind forward-test
  Codex dari evaluasi CL4R1T4S) + sensus delegasi dari DB sesi engine
  (`harness/role-eval-census.py`, stdlib sqlite3) + delegation-rate dari
  metrics JSONL v0.3.70 bila ada. Baseline mock tercatat di
  `harness/role-eval-baseline.json`; protokol lengkap `harness/role-eval.md`.
- CLI: `lumitome role-eval` (`--task/--home/--out/--model/--judge-model/
  --no-judge/--timeout-ms/--mode/--save-baseline/--compare-baseline`,
  `--list`, `--score`); mock 9router scripted di
  `tests/fixtures/role-eval-mock-9router.mjs`; 31 tes baru
  (`tests/suite-role-eval.mjs`, termasuk 2 tes regresi mock).
- Baseline (VM, mock 9router, engine 2.3.0, run6 — bukti
  `~/workspace/lumitome-test-0373/`): checker 3/3, blind judge 3/3
  (kesepakatan 100%), delegasi penuh 4 peran 3/3 (100%); delegation-rate
  median tidak terukur (0/3, lihat batasan); durasi eval 29,7 detik; exit
  code tiap task run 3 (DONE-GATE FAIL — diharapkan, file berubah tanpa
  perintah tes).
- Gates: validate OK (warns 0, lint 70 file), suite 1165/0/2 (+31).
- Batasan jujur:
  - Hook plugin v0.3.70 tidak andal di mode headless `run`: snapshot tool
    orchestrator tetap penuh (12 tool) dan metrik JSONL hanya tertulis bila
    langganan `session.created` menang balapan startup server
    (`shouldEnforce` butuh agent `"orchestrator"`; `undefined` → false).
    Bukti: run4-task1 menulis 8 baris (rate 100%), run4-task2/3 + run5 +
    run6 menulis 0 baris. Delegation-rate headless = best-effort/racy;
    sensus DB adalah sumber delegasi utama (stabil 6/6 run). Ini temuan
    mode headless, bukan TUI.
  - Fakta headless yang dipegang CLI: stdin harus tertutup (kalau tidak, run
    menggantung); wajib `--agent orchestrator` (default engine = "build");
    A4 dilewati untuk `run` → CLI terapkan preset ke file agent sebelum run
    dan kembalikan sesudahnya (terbukti: `git status` bersih dari modifikasi
    agent).
  - Dua bug mock ditemukan + diperbaiki selama baseline (dengan tes regresi):
    cabang parent-first-turn ikut kena giliran anak; ws ditebak dari
    tool-call (read ke path salah → ANTI_SPIN → loop 300×). Satu insiden
    prosedural: mock lama tak mati saat restart (pola pkill tak cocok) →
    run2 tidak valid; mock statis `EVAL_OUT` menulis ke run lama → run5
    tidak valid. Baseline resmi hanya run6.
  - Baseline dari mock, BUKAN model asli; live hanya engine 2.3.0; judge
    blind tetap model yang sama, bukan manusia. Scope hanya P4 — doctor (#2)
    dan memori persisten (#3) tidak masuk slice ini. Tidak ada perubahan
    perilaku v0.3.70–v0.3.72.

## 0.3.72 — ARCHITECTURE.md diperbarui ke keadaan v0.3.71

- Slice docs-only (tanpa perubahan perilaku kode): `ARCHITECTURE.md` diperbarui dari
  header v0.3.47 ke v0.3.72 agar cocok dengan kode v0.3.71. Pemicu: Fahmi mem-paste
  koreksi dari AI lain yang mempelajari repo — koreksi itu sendiri menggambarkan repo
  era ~v0.3.57, jadi SEMUA angkanya diverifikasi ulang dari kode + CHANGELOG + registry
  sebelum ditulis (audit lengkap: `~/workspace/lumitome-test-0372/NOTES.md`).
- Angka yang diperbaiki: skill 900 (734 routable) → **928 (762 aktif, 166 red-team
  disabled)** — bukti `router/skills-registry.json` (928 entri, `pack='red-team'` 166,
  sisanya `active` per `router/skill-db.mjs:167`); suite 863/0/1 (angka lama) →
  **1134/0/2** (v0.3.71, dibuktikan ulang gates slice ini); metrik routing katalog 734
  → 762 (top-1 0,8304 / held-out 0,8333 tetap, dikunci suite-routing).
- §6 Sandbox ditulis ulang ke keadaan v0.3.71: bwrap HANYA bila `LUMI_SANDBOX=bwrap`
  eksplisit, default off; tier strict TIDAK lagi memaksa bwrap; `external_directory`
  ask → allow (bukan dihapus); cek scope hanya bila sandbox non-null. Kode tier +
  `lumitome trust` + `buildSandboxScope` MASIH ADA (tidak dihapus) — yang berubah
  penegakannya, bukan keberadaan kodenya. `sandbox-downgraded` jot dihapus (off kini
  default). Tetap berlaku: deny rahasia/destruktif, MCP deny-by-default, anti-spin,
  jurnal, aturan SSH deploy, `LUMI_TRUST_PROJECT=1`, `LUMI_HARNESS`.
- Baru: §7 Subagent (v0.3.61–v0.3.71) — 4 peran selalu aktif + saklar global on/off;
  preset pindah ke `$LUMI_HOME/lumitome-subagent.json` (A1), file repo jadi seed,
  update mempertahankan preset (A1b), TUI_MODEL gagal bersuara (A2), satu
  `DEFAULT_MODEL` (A3), wrapper sinkronkan file agent sebelum engine start (A4);
  penegakan native v0.3.70 (context hook, guard `execute.before`, metrik JSONL,
  TANPA re-drive, TANPA wrapper `delegate`).
- Baru: §3 tabel MCP dilengkapi figcraft/stitch/drawio/blender (semua OFF by default);
  §5 invarian ditambah preset/`DEFAULT_MODEL`/sandbox-off/mode-auto/lint-gate;
  §4 menyebut konsultasi MWG (v0.3.55) + rujukan §7; §1 menyebut `lumitome upgrade`.
  `README.md` baris 21 diperbaiki (900/734 → 928/762 — `bump-version` tidak
  menyinkronkan kalimat ini, hanya badge + tarball); `docs/ARCHITECTURE.md`
  (redirect) diperbarui v0.3.47 → v0.3.72.
- Yang dari paste TERBUKTI masih benar dan dipertahankan: done-gate modul kode
  (FACT/JUDGMENT, waiver NOT_CONFIGURED beralasan + bukti, blokir push/rilis/scan/CVE);
  guard plugin (hook before tolak/bungkus bwrap, after jurnal + anti-spin); mode auto
  default sejak v0.3.51 (baris status dihapus v0.3.53); lint gate v0.3.54; MWG v0.3.55;
  sync upstream 3-way merge v0.3.56; engine OpenCode 2.3.0; model default 9router
  gemini-3.8-flash-high; orchestrator 6 sektor; routing skill maksimal 5.
- Batasan jujur: metrik routing TIDAK diukur ulang live di slice ini (nilai dari
  `runtime/metrics.json` + gates v0.3.71; latensi ditulis sebagai rentang ber-noise
  ~1–2 ms p50 / ~4–5 ms p95). Isu role-bleed Kritikus loopdesign (15 Nov) dicatat
  satu kalimat di §7 sebagai isu terbuka (rencana P0–P2 belum diimplementasi).
  Komentar kode kadaluarsa yang SENGAJA tidak disentuh: `scripts/validate.mjs:140`
  dan `tests/suite-routing.mjs:65` (menyebut 734 entri) — komentar internal, di luar
  scope slice dokumen.
- Verifikasi: `npm run validate` OK (warns 0), lint OK (68 file), `npm test` 1134 passed / 0 failed / 2 skipped (sama dengan v0.3.71, tanpa asersi baru — slice dokumen).

## 0.3.71 — Preset /subagent pindah ke home + sandbox mati default

- Akar (laporan Fahmi 15 Nov ~23:13 WIB + audit fullcheck §2, TERBUKTI dari kode + git): preset `.opencode/lumitome-subagent.json` adalah state mesin yang TER-COMMIT di git — isinya di HEAD = keempat peran `9router/ag/gemini-3.8-flash-high` (sejak v0.3.61, tak pernah diubah) — sementara `lumitome update` mode git menukar SELURUH direktori repo dengan clone segar dan `afterUpdate` TIDAK menyelamatkan preset. Akibatnya tiap update mengembalikan preset ke seed gemini; watcher v0.3.65 tidak bisa menolong (berhenti saat thinking === initial, sama-sama gemini). Jalur jatuh kedua (independen, silent): TUI_MODEL di `bin/lumitome.mjs` hanya memakai model Thinking bila ada di cache `providers.json`; auto-refresh startup (budget 3 detik, best-effort) gagal diam-diam → cache basi → tetap gemini tanpa peringatan. Literal default tersebar di 8 situs. BUKAN bug: gemini di sesi anak Search adalah perilaku benar (preset Fahmi memang Search = gemini flash) — yang diperbaiki adalah gemini sebagai model sesi utama/orchestrator. Baseline sebelum perbaikan (kode v0.3.70 + preset tes, `~/workspace/lumitome-test-0371/results-{plain,full}.json`): launch biasa lahir `kr/claude-opus-5.5` + tugas penuh 5 sesi model preset benar + 0 request gemini-flash-high — dengan preset UTUH, launch sudah benar; bocornya = update menghapus preset.
- Perbaikan A1 (permanen): sumber kebenaran preset PINDAH ke `$LUMI_HOME/lumitome-subagent.json` (tidak ter-track, tidak disentuh update); file repo `.opencode/lumitome-subagent.json` jadi SEED default saja. Accessor tunggal baru `lumitome/lib/subagent-preset.mjs` (`loadPreset`/`migratePreset`/`saveUserPreset`/`userPresetPath`/`seedPresetPath`): migrasi sekali (seed → file user, atomik, bila file user belum ada); fallback ke seed bila file user hilang/rusak; `--preset <path>` eksplisit tetap menang. Semua pembaca dialihkan: wrapper TUI_MODEL, plugin server (`getPreset`/`savePreset`/`setEnabled` kini baca/tulis file user), `lumitome subagent-preset` CLI (default = file user; on/off menulis ke file user). `npm run validate` memakai `--preset` eksplisit ke seed supaya validasi repo tetap hermetik.
- Perbaikan A1b (jaring pengaman): `lumitome/lib/update.mjs` mempertahankan preset saat swap — sesudah swap git-mode sukses + sesudah rollback + mode npm (stash sebelum `npm install -g`) — preset repo lama disalin ke file user bila file user belum ada (`preservePresetAcrossUpdate`/`preservePresetObject`, non-fatal, hanya log). Ini melindungi preset yang belum termigrasi saat update ke 0.3.71.
- Perbaikan A2 (kegagalan bersuara): keputusan Thinking-vs-default SATU tempat — `resolveSessionDefault(preset, liveModels)` di `scripts/apply-subagent-preset.mjs` (dipakai wrapper DAN `lumitome subagent-preset status`): Thinking dipakai HANYA bila ON + valid + ada di cache live; selain itu default terpin + alasan SELALU disertakan. Wrapper: bila Thinking yang diminta user tidak terpakai, stderr HANYA bila `LUMI_DEBUG` (Fahmi tidak suka diganggu); `status` mencetak sumber preset + Thinking + ada/tidak di cache live + model default sesi TUI + alasannya.
- Perbaikan A3 (satu sumber): `lumitome/lib/default-model.mjs` = satu konstanta DEFAULT_MODEL; semua situs kode mengimpor dari sana (wrapper, flow.mjs + re-export ke prompt/rpc/index, apply script, providers.mjs saran sesudah connect). Kedua `opencode.jsonc` tetap literal + komentar penanda sumber tunggal. `router/skill-db.mjs` TIDAK diubah (model router L1, tujuan berbeda).
- Perbaikan A4 (sinkron file agent saat launch — DITEMUKAN live 15 Nov, tes penuh pertama v0.3.71 GAGAL): parent sudah opus, tapi KEEMPAT sesi anak tetap `9router/ag/gemini-3.8-flash-high` (7 request). Akar: sesi anak mengambil model dari file agent `.opencode/agents/{role}.md` (`model:`), BUKAN dari preset; engine memuat definisi agent saat startup dan TIDAK membaca ulang sesudah popup save (terbukti: save menulis opus ke disk 16:56, sesi anak sesudahnya tetap gemini-high; `config/agents` = symlink ke repo `.opencode/agents`, inode sama). Perbaikan: wrapper `bin/lumitome.mjs` (blok TUI_MODEL, sebelum engine start) memanggil `ASP.applyPreset({root: REPO, preset: loaded.preset, liveModels: null})` — diff-only, diam kecuali `LUMI_DEBUG`, gagal sinkron tidak menggagalkan launch; `liveModels: null` = validasi format saja (preset sudah divalidasi saat save; cache live basi tidak boleh menggagalkan sinkronisasi). Rerun tes penuh sesudah A4 (repo dipulihkan ke keadaan pasca-update: file agent + seed semua gemini): LOLOS — gemini-high 0, semua peran sesuai preset.
- Scope B (permintaan Fahmi 23:13 WIB): sandbox + batas baca/tulis diubah ask → allow — seperti OpenCode biasa, mode auto tetap default. Sandbox (bwrap) hanya bila `LUMI_SANDBOX=bwrap` eksplisit; default off (tier strict tidak lagi memaksa bwrap). Plugin guard meneruskan `sandbox: null` ke `evaluateTool` saat off (cek scope dilewati; `evaluateTool` langkah 5 dijaga `if (sandbox)`); `external_directory` diubah ask → allow (BUKAN dihapus — koreksi: menghapusnya membuat aturan `*_*` deny di frontmatter agent menelan external_directory karena aturan terakhir yang cocok menang, terbukti live 0371 read di luar proyek ditolak "Permission denied: external_directory"; `allow` eksplisit sesudah wildcard di gen-policy + kedua opencode.jsonc + build-config, lalu regenerasi 14 file agent) dan assertion check-opencode dihapus; jot + peringatan `sandbox-downgraded` dihapus (off kini default, bukan penurunan); `lumitome trust` + baris verbose disesuaikan. TETAP berlaku: deny rahasia (.env, .ssh, kunci), deny perintah destruktif (rm -rf, sudo, git push --force/main), MCP deny-by-default, anti-spin. Trade-off jujur: lebih leluasa, lebih sedikit pengaman terhadap perintah destruktif.
- Perilaku v0.3.70 dipertahankan: penegakan plugin (context hook + guard + metrik), preset + grandfathering, direktori sesi, toast peran, aturan notice, 4 peran selalu aktif, saklar global on/off, toast "Subagent ON"/"Subagent OFF", model hanya via 9router, tanpa fallback otomatis ke model free kenari.
- Verifikasi: `npm run validate` OK (warns 0), lint OK (68 file), `npm test` 1134 passed / 0 failed / 2 skipped (baseline v0.3.70: 1102 + 32 asersi baru: 27 A1/A1b/A2/A3/scope-B + 4 A4 + 1 scope-B allow di file agent), routing golden top-1 0.8304 / held-out 0.8333 tanpa regresi (dikunci suite-routing.mjs). Tes live VM (mock 9router, `~/workspace/lumitome-test-0371/`, preset user opus/flash-biasa/sonnet/opus, seed repo semua gemini): (1) simulasi `update()` git-mode asli — exit 0, repo baru 0.3.71, seed baru semua gemini (swap TERJADI), file user tetap opus/flash, rollback kembali 0.3.70 + file user utuh (`results-update-sim.json`); (2) migrasi — home kosong + seed kustom → file user terbentuk berisi nilai seed, status menyebut "preset: user" + Thinking opus (`results-migration.json`); (3) launch biasa — sesi lahir opus, 2 request opus, gemini-high 0 (`results-plain.json`); (4) tugas penuh "Ya, mulai" — 5 sesi (orchestrator/thinking/reviewer opus, builder sonnet, search flash biasa), 21 request, gemini-high 0, keempat `[HASIL-*]` ada, notice 0 (`results-full.json`); (5) SBX scope-B — baca `/srv/sbx-outside-0371/note.txt` + tulis `/home/hatch/sbx-outside-0371/salinan.txt` (isi persis note) tanpa blokir, builder sonnet, gemini-high 0 (`results-sbx.json`). Dua temuan live selama pengujian (keduanya diperbaiki + diuji ulang, bukan ditutup-tutupi): A4 (sesi anak memakai model file agent, bukan preset — engine tidak baca ulang sesudah popup save) dan scope-B (menghapus `external_directory` membuat `*_*` deny menelannya — koreksi ask → allow).
- Batasan jujur: (1) Live baru terverifikasi di engine 2.3.0 (VM); di 2.2.4 (mesin Fahmi sebelum `lumitome upgrade`) jalur kode identik tapi belum dibuktikan live. (2) Preset yang SUDAH terhapus oleh update sebelum 0.3.71 tidak bisa dipulihkan otomatis — user harus mengaturnya sekali lagi lewat popup `/subagent` (sesudah itu update tidak akan menghapusnya lagi). (3) `lumitome subagent-preset` tanpa `--preset` kini menulis file agent repo dari preset USER, dan tiap launch TUI menyinkronkan file agent dari preset user sebelum engine start (A4) — di mesin instalasi, file agent bisa tampak "dirty" di git sesudah launch pertama; itu perilaku yang benar (file agent harus cocok dengan preset user agar sesi anak memakai model yang dipilih). (4) Perubahan preset lewat popup di TENGAH sesi berlaku penuh untuk sesi anak hanya sesudah restart TUI (engine tidak membaca ulang definisi agent yang sudah dimuat); sesi utama baru via "Ya, mulai" langsung memakai model Thinking yang baru. (5) Launch langsung binary engine (tanpa wrapper `lumitome`) melewati sinkronisasi A4 + TUI_MODEL — sama seperti sebelum 0.3.71.

## 0.3.70 — Delegasi /subagent native — penegakan di plugin

- Mekanisme Claude Code dari deep-dive (`~/workspace/research_notes/claude-code-subagent-deep-dive-20261115-1428/report.md` §4–§5) diport ke plugin server `lumitome.subagent` — delegasi ditegakkan di KODE, bukan diminta lewat instruksi `.md`. Tidak ada prompt raksasa baru, tidak ada file rules yang lebih panjang, tidak ada wrapper tool `delegate` (riset melarangnya — tool subagent bawaan sudah ada).
- Peringkat 1 — direct tools dihapus dari orchestrator: context hook (`ctx.session.hook("context")`) menghapus semua tool kecuali allowlist `[subagent, question, read, glob, grep]` di tiap panggilan model saat mode subagent ON + agent orchestrator; `scripts/apply-subagent-preset.mjs` menyinkronkan permissions di `.opencode/agents/orchestrator.md` (ON: edit deny, shell deny, subagent allow; OFF: edit allow + deny task_plan/findings seperti semula) dan `validate --check` gagal-tertutup bila basi. Peran (thinking/search/builder/reviewer) TIDAK disentuh — builder tetap punya edit/write/shell.
- Peringkat 2 — protokol delegasi pendek tiap panggilan model: hook yang sama mendorong protokol ~150 kata (tabel peran→kata kerja pemicu, format label `[Builder] …`, urutan, BLOCKED satu pintu) ke `event.system`, dan deskripsi tool subagent bawaan dipertajam (blok pemicu `DELEGASI WAJIB …` ditambahkan di depan deskripsi asli engine, mekaniknya dipertahankan). Deskripsi keempat peran ditulis ulang trigger-first + saling eksklusif (`Pemicu: … JANGAN dipakai untuk …`).
- Peringkat 3 — guard `execute.before`: `ctx.tool.hook("execute.before")` menolak tool mutasi (edit/write/patch/shell/execute) dari orchestrator + memvalidasi panggilan subagent (agent harus salah satu dari 4 peran, prompt + description tidak kosong); penolakan melempar Error berawalan `[subagent-guard] `. **Spike-test live MEMBUKTIKAN throw-to-block bekerja di engine 2.3.0** (bukan asumsi): mock mengembalikan `edit` di giliran pertama parent → guard melempar → error `[subagent-guard]` muncul di pesan sesi → file TIDAK berubah → model langsung mendelegasikan ke Thinking. Guard fail-open bila agent tidak diketahui (sesi bukan orchestrator tidak boleh terblokir); context hook tetap jadi penegakan utama untuk sesi itu (hook membawa `event.agent`). Bentuk event terkonfirmasi live: `execute.before` membawa `{tool, sessionID, agent, messageID, id, input}`.
- Peringkat 4 — deskripsi peran + tool dipertajam (lihat peringkat 2); tidak ada wrapper.
- Peringkat 5 — pengukuran + audit akhir giliran, TANPA re-drive: plugin menulis `$LUMI_HOME/subagent-metrics.jsonl` (entri `tool` per panggilan, `guard-block`, `turn-end` berisi subagent/mutating/blocked/delegated per giliran); `node scripts/subagent-metrics.mjs [--json] [--home <dir>]` meringkas delegation-rate per sesi. **Re-drive sengaja TIDAK dibangun**: OpenCode 2.3.0 tidak punya hook Stop/SubagentStop yang bisa memblokir; re-prompt berbasis event sesudah giliran berakhir akan balapan dengan input user dan berisiko loop — audit hanya mencatat, tidak mengulang.
- Perilaku v0.3.69 dipertahankan: preset + grandfathering model tersimpan, perbaikan direktori sesi "Ya, mulai", toast peran ("<Label> jalan"), aturan notice (sesi baru tanpa notice). Saat `/subagent OFF`, perilaku normal kembali penuh (direct tools ada lagi) — diuji eksplisit (lihat bawah).
- Verifikasi live di VM (engine 2.3.0, PTY + mock 9router, driver `~/workspace/lumitome-test-0370/run-0370-{spike,v1,off}.py`, mock `mock-9router-0370.mjs`): (1) SPIKE (DIRECT_EDIT=1, `LUMI_SUBAGENT_DEBUG=1`, 133 dtk): tugas selesai 6,0 dtk, keempat [HASIL-*] ada, notice 0, 5 sesi semua di folder proyek ws dengan model kr yang benar; snapshot tool orchestrator 10 request = `[glob, grep, question, read, subagent]` (tanpa edit/write/shell/execute/skill/webfetch/websearch); deskripsi subagent dipertajam; protokol TERINJEKSI (flag `sysHasProtocol` di system message 68.697 karakter — protokol di ujung, itulah kenapa slice log 6.000/30.000 karakter sempat tidak melihatnya; debug `context-system` membuktikan `event.system` array 5 part sesudah push); edit langsung dicoba parent → 1 guard-block tercatat + error `[subagent-guard]` terlihat di sesi + file TIDAK memuat "EDIT LANGSUNG" + kategori 9. (2) V1 bersih (tanpa spike/debug, 129 dtk): tugas selesai 2,6 dtk, 9 request orchestrator dengan snapshot sama, protokol terinjeksi, 0 guard-block (sesuai harapan run bersih), metrik 8 baris (4 tool, 4 turn-end). (3) OFF (preset off, tugas sepele, 132 dtk): snapshot tool orchestrator kembali lengkap 12 tool `[edit, glob, grep, question, read, shell, skill, subagent, webfetch, websearch, write, execute]`, protokol TIDAK terinjeksi, deskripsi TIDAK dipertajam, 0 guard-block, 0 baris metrik; balasan mock "ok (mock)" tampil di TUI dengan model default `ag/gemini-3.8-flash-high`. Toast peran muncul di ketiga run (Thinking/Search/Build/Review).
- Verifikasi: `npm run validate` OK (warns 0), lint OK (66 file), `npm test` 1102 passed / 0 failed / 2 skipped (baseline v0.3.69: 1074 + 28 asersi baru), routing golden top-1 0.8304 / held-out 0.8333 tanpa regresi (dikunci suite-routing.mjs).
- Batasan jujur: (1) Live baru terverifikasi di engine 2.3.0 (VM); di 2.2.4 (mesin Fahmi sebelum `lumitome upgrade`) jalur kode plugin identik tapi belum dibuktikan live. (2) Guard mengandalkan throw di `execute.before` — terbukti bekerja di 2.3.0, tapi ini perilaku engine yang tidak dinyatakan verbatim di dokumen resmi plugin server; bila engine mengubahnya, penegakan jatuh kembali ke penghapusan tool di context hook + deny permissions (keduanya tetap aktif). (3) Toast peran mengandalkan event `session.tool.called` (sejak v0.3.69) — bila langganan SSE putus, toast tidak muncul (fail-silent; delegasi tetap jalan). Di run V1, toast "Thinking jalan" tidak tertangkap snapshot layar karena rantai mock selesai 2,6 dtk (toast saling menimpa) — artefak kecepatan mock yang sama seperti di v0.3.69, bukan kode plugin; sesinya + [HASIL-THINKING] ada. (4) Di run OFF, `task_done` driver tercatat False karena driver gagal menemukan parent session (belum ada sesi saat layar welcome — sesi baru tercipta saat tugas diketik); balasan mock "ok (mock)" TERBUKTI tampil di layar + 1 request orchestrator tercatat — ini bug driver, bukan produk. (5) Metrik hanya mencatat; tidak ada re-drive dan tidak ada penegakan di luar plugin (lihat peringkat 5). (6) Catatan harness (bukan cacat produk): home tes baru butuh seed manual `credentials.json` (dummy key — mock tidak memeriksanya), symlink `bin/opencode` → engine 2.3.0 hasil ekstrak, dan `providers.json` berisi daftar model mock — tanpa ketiganya wrapper menampilkan wizard provider-nya sendiri / gagal `setpriv` / dialog "Model unavailable".


## Versi lama

Catatan rilis sebelum 0.3.70 diarsipkan per sepuluh versi di [`docs/changelog/`](docs/changelog/README.md).
