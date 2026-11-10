# Changelog

## 0.3.35 — Verifikasi resmi kunci SSH trusted

- Verifikasi resmi (atas permintaan Fahmi — "resminya"): pengecualian guard v0.3.34 kini punya tes suite + lolos full check. Tes lama yang mengunci perilaku lama diperbarui (kunci `~/.ssh` sebagai `-i` di tier trusted kini allow, bukan deny) + 3 tes baru (12 asersi): `-o IdentityFile` + `scp -i` allow di trusted / deny di standard; baca/salin kunci tetap deny di trusted; perintah remote yang menyentuh kunci/`.env` tetap deny (hanya satu kemunculan nilai kunci yang dikecualikan); kunci deploy lama tetap allow; `-i` non-secret di standard deny ssh-key; multi-segmen fail-closed.
- Validate OK (warns 0), test **372/0** (369 + 3 tes baru — 1 tes lama diperbarui ke semantik baru + 3 tes baru, 12 asersi). Dengan ini catatan "tanpa testing" di v0.3.34 resmi dicabut: perubahan guard itu kini terverifikasi penuh (hasil E2E updater ada di catatan rilis).

## 0.3.34 — Kunci SSH pribadi di tier trusted

- Guard SSH dibuka sempit (atas permintaan eksplisit Fahmi — sebelumnya agent tidak bisa memakai kunci pribadi `~/.ssh` sama sekali, sehingga kerjaan deploy terganggu): di tier `trusted` (`lumitome trust trusted`), agent boleh memakai kunci `~/.ssh` HANYA sebagai argumen `-i`/`-o IdentityFile=` perintah `ssh`/`scp`/`sftp`/`rsync` (`sshKeyUseOnly` di `harness/lumi-guard.mjs`). Isi kunci tidak pernah dibaca/disalin/dicetak — hanya path-nya yang diteruskan ke biner ssh. Segala akses secret lain tetap ditolak di semua tier: `cat`/`cp` kunci, `.env`, variabel key/token, env-dump; perintah remote yang menyentuh `~/.ssh`/`.env` tetap ditolak (hanya SATU kemunculan nilai kunci yang dikecualikan dari pemeriksaan); tier non-trusted tetap wajib kunci deploy `~/.lumitome/<nama>`; bentuk `-e` rsync dan `-i` menempel tetap ditolak (fail-closed).
- **Catatan rilis (jujur): dirilis atas permintaan Fahmi tanpa fase testing — suite `npm test` dan E2E updater DILEWATI.** Verifikasi yang dilakukan hanya smoke check guard (10 kasus: 9 lolos sesuai harapan — trusted `ssh -i ~/.ssh/id_ed25519` allow, standard deny, `cat`/`cp` kunci deny di trusted, perintah remote menyentuh kunci deny, kunci deploy lama tetap allow, `cat .env` deny, `scp -i` allow; 1 kasus ekspektasi saya sendiri yang salah — `ssh -i /etc/passwd` di trusted allow karena `/etc/passwd` bukan path rahasia, dan di standard tetap deny oleh aturan ssh-key). Tes suite untuk aturan baru ini belum ditulis — disarankan ditambahkan di rilis berikut sebelum ada perubahan guard lagi.

## 0.3.33 — Tunggakan lunas

- Upstream sync (§1, utama): 9/9 sumber di-sync ke HEAD baru — obra/superpowers `2ce8aa1`→`22f0b46`, pbakaus/impeccable `df3a4ab`→`500eeb7`, anthropics/skills `ca45fc4`→`2c5958e`, cursor/plugins `4dd1d05`→`236e548`, vercel-labs/json-render `92b2730`→`1819412`, mattpocock/skills `a496f55`→`4ae2317`, google/elephant-goldfish-model `403d888`→`bdcfe8c`, nextlevelbuilder/ui-ux-pro-max-skill `28b3b8d`→`4f2dbb6`, morluto/rea `8f920bb`→`c52a9b9`. 175 SKILL.md frontmatter diperbarui + file konten; 1384 file diverifikasi (0 masalah); semua diff dibaca manual (benign, tanpa prompt-injection); **0 sumber dicut**. api-security / llm-security tetap nonaktif. PROVENANCE.md `TODO: resolve pin` (7 skill *-ops + penulis-ilmiah) DIBIARKAN TODO — sumbernya ("GrokBestFriend 1.3.1 skill snapshot") tidak ada referensinya di repo; tidak dikarang.

- Hue AND (§2): aturan `purple-gradient` di `harness/design-gate.mjs` pindah dari OR ke AND, ikut upstream ui-craft `purple-cyan-gradient` — fail HANYA bila satu gradien mengandung stop ungu (hue 255–330°) DAN stop cyan/biru (hue 170–255°). **Konsekuensi terus-terang: gradien ungu murni kini lolos** (dulu gagal di OR), begitu juga gradien cyan murni; gradien ungu+cyan tetap gagal. Tes diperbarui ke semantik AND (stop tunggal lolos, pasangan gagal, batas hue 255° + cyan ikut gagal); fixture anti-slop (`#7C3AED` + `#4F46E5`) tetap FAIL karena pasangannya lengkap. Red-test ulang: Tokyo 20x FAIL 11 findings, Kopi Senja index-2 FAIL 4 findings, index-3 PASS 0 findings — identik sebelum/sesudah (ketiganya tidak memakai gradien ungu; diverifikasi lewat gate, bukan asumsi).
- Scan-gate (§3): pertama kali RUN di rilis ini — osv-scanner v2.7.1 + gitleaks v8.30.1 dipasang di VM (checksum terverifikasi); `npm run scan` PASS (osv 0 kerentanan; gitleaks --pre-commit bersih). Scan riwayat penuh menemukan 1 kunci PostHog publik (phc_, client-side by design) yang di-vendor dari upstream edenfunf/reelmimic + 2 false positive pesan error — ketiganya ditindaklanjuti lewat entri allowlist ber-alasan di `.gitleaks.toml` (mekanisme repo); scan riwayat penuh kini "no leaks found". Catatan: rotasi kunci PostHog butuh pemilik proyek upstream; gate kanonis hanya --pre-commit sehingga temuan riwayat tidak tertangkap gate rilis (ditindaklanjuti manual di rilis ini).
- Latensi route() (§4): optimasi loop trigram + vocab-cache per source_hash di `router/l0.mjs` (+ memoize loadVec gagal di `router/skill-db.mjs`): median golden 154 (useL1:false, cache mati) 62,2ms → 8–12ms (~81–87%); picks + skor kandidat byte-identik sebelum/sesudah (semantik ranking tidak berubah). Metrik golden kini recall@5 1,0 (lihat §5).
- 4 golden misses architect/grill (§5): lunas tanpa test-fitting — akar masalah: keempat skill (architect, grill-me, grill-with-docs, grilling) di packs/misc tanpa jembatan bahasa Indonesia (tanpa rule L0, tanpa alias, tanpa sinonim arsitektur↔architecture). Perbaikan: rule L0 baru "review/tinjau arsitektur", alias kurasi di skills-aliases.json, sinonim ID↔EN di enrich.mjs, gen-policy (+4 allow coding). Metrik golden: recall@5 0,9643 → 1,0, MRR 0,8795 → 0,8973, miss 4 → 0, top-1 0,7946 tetap, L0-mismatch 0. Tes pin metrik §4 diperbarui ke angka baru yang sah (bukan dilemahkan).
- PRD:23 + diagram (§6, §7): PRD:23 ditulis ulang ke semantik pasca-v0.3.27 (satu korpus; enable-pack hanya menyalin ke .opencode/skills agar OpenCode memuat native; red-team 166 tetap disabled). Diagram + README + ARCHITECTURE + SKILLS-CATALOG diselaraskan ke registry terverifikasi: korpus 900 (aktif-folder 127, pack 773, cermin 66), 734 ter-route, per sektor coding 282 / penulisan 171 / security 174 / media 162 / misc 102 / riset 5 / finance 4. **DICUT sebagian: render ulang PNG diagram** — .mmd sudah diperbarui tapi Chrome VM mati (SIGTRAP) sehingga PNG belum bisa di-render ulang; PNG lama (angka basi) tetap dipakai sampai di-render di mesin sehat (mmdc terpasang di ~/mmdc-install + perintah di laporan worker).
- Generator definisi MCP (#5) (§8): DICUT — desain di repo hanya satu paragraf audit ("generate static config + docs table from the map") tanpa spesifikasi yang bisa diimplementasikan tanpa mengarang: skema transport tidak ada di map, server skills + gw-* tidak ada di map, mekanisme splice JSONC + pemetaan tabel docs + perintah --check + batas runtime override semuanya tidak ditentukan. Tidak ada file yang diubah. Syarat untuk rilis berikut: dokumen desain singkat yang menetapkan keenam hal itu.
- MaxListeners (§9): `MaxListenersExceededWarning` dari `.opencode/skills/design-taste-frontend/scripts/lib/cdp.mjs` hilang — tiap `Browser.launch` mendaftarkan listener `process` (`exit` + SIGINT/SIGTERM/SIGHUP) yang tidak pernah dilepas (11 launch = 4 warning); `close()` kini melepasnya (juga saat launch gagal), bukan `setMaxListeners` karena ini kebocoran. Tes baru: 3× launch+close → listener kembali ke baseline, 0 warning; probe 12× launch+close → 0 kemunculan warning di stderr.
- Validate OK (warns 0), test **369/0** (7 tes baru: §2 +1 net, §4 +2, §5 +4 asersi; 362 lama tidak dilemahkan). Metrics golden 154 / L0-mismatch 0 — top-1 0,7946, recall@5 1,0, MRR 0,8973, miss 0. Scan-gate PASS (osv-scanner v2.7.1 + gitleaks v8.30.1; osv 0 kerentanan). Secret grep pada diff: 0 hit.

## 0.3.32 — Kontrak yang tidak bisa dilewati

- Kontrak perilaku WAJIB untuk DONE + kontrak default otomatis (§1, utama): akar masalahnya terverifikasi — loop `/loopdesign 5` Kopi Senja Minecraft (index-3.html + DESIGN.md, Lumitome v0.3.31) klaim gate PASS 0 findings (terverifikasi benar), tapi bug double-add dari index-2 BERTAHAN: 1 klik "RACIK SEKARANG" menambah Rp36.000, harusnya Rp18.000 (dua handler klik di #btnCraftItem). Penyebabnya: DESIGN.md tanpa blok behavior-contract dan skill v0.3.31 menjalankan behavior gate "bila ada kontrak" — probe tidak pernah jalan. Kini `harness/design-behavior.mjs` menurunkan kontrak default otomatis dari DOM (`deriveDefaultContract`/`deriveDefaultContractInPage`: keranjang kosong saat dimuat, klik tambah = tepat 1 item, filter menyaring, form kosong = error muncul, toggle ganti state — hanya yang bisa diturunkan dengan keyakinan tinggi, kind baru `click-then-attr` untuk toggle) dan `measureAndGateWithBehavior` menjalankan probe SELALU tiap iterasi (kontrak eksplisit > kontrak dari DESIGN.md/behavior.json > kontrak default turunan DOM; blok hilang dicatat di `contractNote`, bukan jadi skip; hasil membawa `behaviorSource` "design" | "default" | "behavior.json"). Bila tidak ada satu pun check yang bisa diturunkan → SATU finding warn "tidak ada interaksi yang bisa diprobe" (bukan skip diam-diam, bukan fail). Skill `loopdesign` (§1, §2, §3, §4) + orchestrator aturan 5 diperbarui: "behavior bila ada kontrak" dihapus — diganti "behavior selalu jalan"; tidak ada DONE tanpa behavior probe yang berjalan DAN lolos. Red-test (dijalankan koordinator, 5/5): R1 index-3 tanpa kontrak → behavior FAIL (cart-add Rp36.000, source "default"); R2 Tokyo 20x → behavior FAIL (cart-empty ¥12.000 prefill + cart-add ¥24.000); R3 kontrak eksplisit → source "design", note null, tanpa regresi; R4 halaman statis → warn 0-check, pass tetap true; R5 golden (lihat §2).
- Goldens / reference-anchored judging (§2): modul baru `harness/design-golden.mjs` — golden = render referensi tepercaya untuk keluarga brief yang sama (screenshot + DESIGN.md/token + ringkasan brief, di `goldens/<nama>/`, BUKAN dari output loop sendiri). `loadGolden` fail-closed (throw bila tanpa screenshot / tanpa arah-token / brief rusak), `goldenDivergence` deterministik (arah berbeda, token di luar golden, token golden tak dipakai, overlap 0), `criticInput` mendapat field `golden` (tetap membuang code/klaim/prompt). **MENGINFORMASIKAN, NEVER-GATE** — `evaluateDesign` tidak membaca golden (terverifikasi: 0 kemunculan "golden" di badan evaluateDesign; PASS tetap PASS, FAIL tetap FAIL). Skill `loopdesign` mendapat § Golden (cara menyediakan, kapan dipakai, 4 batas). Red-test R5: file cocok → 0 divergensi; file menyimpang → divergensi terdeteksi; vonis tidak berubah.
- Batasan derivasi yang disengaja: form dengan >1 error tersembunyi (seperti index-3 yang punya 3 error) tidak diturunkan check form-nya — hanya pola yang yakin yang dibuat. Satu koreksi ekspektasi saat tes: fixture gate kontrak-default yang benar tetap punya 1 warn kontras yang sah (teks putih di karamel 5,33:1, lolos AA tapi di bawah 7:1) — asersi diubah dari "0 findings" menjadi "tanpa finding fail" (warn memang bukan fail).
- Validate OK (warns 0), test **362/0** (32 tes baru: 13 §1 deriveDefaultContract + always-probe + 0-check warn + jalur eksplisit, 19 §2 golden — loadGolden fail-closed, goldenDivergence, criticInput+golden, NEVER-GATE; 330 lama tidak dilemahkan). Metrics golden 154 / L0-mismatch 0 — top-1 0,7946, recall@5 0,9643, MRR 0,8795, miss 4 (identik v0.3.31; router tidak disentuh). Scan-gate UNRUN (osv-scanner + gitleaks tidak terpasang di VM); secret grep manual pada diff: 0 hit.

## 0.3.31 — Loop yang menguji perilaku

- Behavior gate (§1, utama): modul baru `harness/design-behavior.mjs` — Maker mendeklarasikan **kontrak interaksi** halaman (blok ```` ```behavior-contract ```` di `DESIGN.md` atau `behavior.json`: keadaan awal + hasil klik yang diharapkan; kind `text-equals`/`text-contains`/`count`/`exists`/`attr-equals`/`click-then-text`/`click-then-count`), `probeBehavior` menjalankannya di browser sungguhan tiap iterasi, hasilnya findings gate (`behavior`/`probe-gagal`). Probe gagal jalan (timeout, elemen tak ditemukan) = finding `probe-gagal`, bukan crash loop. Red-test: file Tokyo 20x FAIL behavior ("keranjang kosong saat dimuat" — total ¥12.000); fixture keranjang-kosong PASS; Kopi Senja basic + 5x diprobe (filter/keranjang/slider/form/countdown): 6/7 PASS di keduanya — keranjang kosong saat dimuat, tambah item, filter, slider, countdown jalan; form: submit dengan nama kosong memunculkan error nama (tanggal sudah terisi default hari ini, jadi yang dicek error nama). Satu koreksi ekspektasi saat red-test: cek form awal ("error tanggal") salah sasaran karena tanggal memang terisi default — diganti ke error nama.
- Token-fidelity yang bisa ditindaklanjuti (§2): finding kini menyebut **nama variabel CSS** (mis. `--black`, `--border`, `--text-muted` — dikumpulkan `measurePage` dari stylesheet halaman, termasuk nilai beda per tema gelap/terang) + **saran ganti** (token terdekat / tint dari token). `DESIGN.md` wajib deklarasikan netral di seksi `Netral:` sebagai tint turunan token (`--text-muted: tint #F2F2F7 60%`); `parseDesignFile` membaca `neutrals` + `tokenVars`. Aturan skill: bila yang tersisa hanya findings token-fidelity, perbaiki itu dulu sebelum poles apa pun. Red-test: 3 warna Tokyo (#000000/--black → #0B0B14, #252538/--border → #14141F, #A0A0B8/--text-muted → #F2F2F7) menghasilkan findings bernama + bersaran; fixture netral-sebagai-tint PASS (0 token-fidelity).
- Kritikus dikasih data perilaku (§3): `criticInput` mendapat field `behavior` (hasil probe: checks lolos/gagal + keadaan awal), tetap membuang code/klaim/prompt (tes seperti tes criticInput yang ada).
- Cek aset dua lapis (§4): gambar gagal di browser → gate cek HTTP URL-nya (status + content-type / magic bytes JPEG/PNG/GIF/WebP/AVIF/SVG, timeout 5 detik, paralel). 200 + byte gambar valid = BUKAN fail (warn "artefak lingkungan"). Red-test: 9 foto Tokyo → **0 asset fail** (9 warn); fixture URL mati → fail. Waktu gate Tokyo: 11,6 detik (v0.3.30) → 12,9 detik (cek HTTP paralel 9 URL) — naik ~1,2 detik, bukan perlambatan berarti.
- Aturan berhenti saat mentok (§5): `checkStuck` + state loop `<workspace>/.tmp/loopdesign/loop-history.jsonl` (`recordLoopIteration`/`stuckVerdict`) — findings tidak berkurang 2 iterasi berturut-turut → loop berhenti dengan vonis "mentok di N findings" (`nextLoopAction` reason `mentok`). Red-test: [21,21,21] → mentok di 21 findings; [45,21,21] dan [10,9,9] belum mentok.
- Rebuild kritikus pairwise (§6): modul baru `harness/design-pairwise.mjs` — bandingkan iterasi sekarang vs sebelumnya di atas binary checklist per tugas (satu item per kategori gate + total findings; menang bila fail lebih sedikit), DOM bounding box + computed styles di samping screenshot, packet kritikus dalam DUA urutan presentasi (pemenang harus sama di keduanya, kalau tidak tie). **MENGINFORMASIKAN, never-gate** — vonis tetap milik gate + behavior gate. Red-test: Kopi Senja 5x > basic di kedua urutan (5x menang 3-0: tap-target 19→0, text-cases 4→0, total fail 37→14; token-fidelity seri 13-13). Goldens / reference-anchored judging (rank 3 riset) **DITUNDA terus-terang ke v0.3.32** — tidak dikerjakan setengah-setengah di rilis ini.
- Installer (§7): `--no-same-owner` di SEMUA 4 titik ekstraksi tar `install.sh` (opencode, Node, codebase-memory, uv) + guard `|| die` di tiap titik (titik Node lewat `run`, yang sudah die) — install sebagai root atas tarball milik uid lain tidak lagi mati diam-diam. Tes suite menegaskan 4 titik + guard; E2E install segar (root + PATH tanpa node sistem) dijalankan sebagai bagian release gate (hasilnya di catatan GitHub Release).
- Validate OK (warns 0), test **330/0** (19 tes baru: token-fidelity actionable, behavior/probe-gagal, criticInput+behavior, aset dua lapis, checkStuck/nextLoopAction mentok, scoreChecklist, parseDesignFile Netral, parseBehaviorContract, state loop, red-test browser fixture cart/netral/asset-dead/pairwise, install tar). Metrics golden 154 / L0-mismatch 0 — top-1 0,7946, recall@5 0,9643, MRR 0,8795, miss 4 (identik v0.3.30; router tidak disentuh). Scan-gate UNRUN (osv-scanner + gitleaks tidak terpasang di VM); secret grep manual pada diff: 0 hit.

## 0.3.30 — Installer tenang

- `install.sh` kini tampil tenang, dengan bahasa visual yang sama seperti `lumitome update`: logo `L U M I T O M E` emas di awal (TTY), satu baris status spinner yang diperbarui di tempat (frame braille bila UTF-8, ASCII `|/-\` bila bukan; tulis ke stderr agar stdout bersih), dan satu baris hasil di akhir. Non-TTY / CI / `TERM=dumb` / `--dry-run` / `--doctor`: baris polos tanpa animasi dan tanpa ANSI — `say`/`ok`/`warn`/`die` juga mematikan ANSI bila bukan TTY. `--doctor` tetap exec `doctor.sh` tanpa spinner dan tanpa logo.
- Tujuh langkah install jadi label manusiawi ("Menyiapkan mesin", "Menyiapkan Node", "Menyiapkan codebase-memory", "Menyiapkan uv", "Menyiapkan env", "Menyiapkan proyek", "Menyiapkan launcher") — bukan lagi "1/7 OpenCode v2.2.4…". Detail teknis (unduh, SHA256, tar/unzip, `npm ci`, `git pull`/`clone`, versi tool) masuk ke `$SW_HOME/logs/install.log` (ditentukan sedini mungkin; bila `$SW_HOME/logs` belum bisa ditulis, log dulu ke TMP lalu dipindahkan di akhir install sukses). Output tool (`npm ci`, `skill-index`, `gen-policy`, `playwright`, `git clone`/`pull`, `curl`) dialihkan ke log. Saat gagal, `die()` mematikan spinner dulu (bunuh loop background, pulihkan kursor, bersihkan baris), lalu mencetak FAIL + hint + path log + ekor log; log TMP diselamatkan ke `$SW_HOME/logs` bila bisa. Satu-satunya hint yang tetap tampil di layar setelah "Selesai" adalah `$LUMI_BIN_DIR` belum di PATH (satu baris singkat); sisanya (skip `--no-cbm`/`--no-uv`, sqlite3 CLI opsional, langkah berikut) hanya di log.
- Uninstall (`install.sh --uninstall`): spinner "Menghapus Lumitome…" lalu satu baris "Selesai — Lumitome dihapus (launcher + ~/.lumitome)"; non-TTY baris polos tanpa ANSI. Perilaku hapus TETAP: hanya launcher bermarker + `$SW_HOME` bermarker; OpenCode user tidak disentuh.
- Perilaku keamanan instalasi TIDAK berubah: verifikasi SHA256 ganda (hash terpin + file checksum rilis), cek flavor engine, cek marker `.lumitome-home`, tolak launcher bukan milik lumitome, `--dry-run` tetap mencetak perintah tanpa spinner.
- Catatan: animasi baru terlihat saat install BERIKUTNYA (setelah v0.3.30 rilis) — install yang sudah berjalan tidak berubah retroaktif.
- Validate OK (warns 0), test **311/0** (7 tes baru: label langkah + log, spinner/logo emas, `bash -n`, `--uninstall` non-TTY + sentinel user utuh, uninstall tidak menyentuh home tanpa marker/launcher asing, `--dry-run` mencetak perintah, red-test curl hilang → FAIL + path log tanpa sisa escape). TTY terverifikasi manual via `script`: logo emas dua warna, spinner braille emas, `✓ Selesai`, kursor pulih; dry-run di TTY tetap polos.

## 0.3.29 — Koreksi atribusi ui-craft

- Koreksi faktual v0.3.28: ui-craft (educlopez/ui-craft, MIT) PUNYA registry 43 aturan anti-slop terverifikasi di `scripts/detect/rules.mjs` (71.233 byte; 14 critical, 25 major, 2 warn, 2 minor; total gate 52 = 43 anti-slop + 4 token + 5 a11y), plus UICraftScore deterministik 0–100 offline zero-dep (`evals/quality/score.mjs`), tanpa telemetri yang ditemukan. Komentar atribusi di `harness/design-gate.mjs` diperbaiki (dulu salah mengklaim "43 aturan tidak terverifikasi"); konsep `purple-gradient` + `gradient-text` kita dikoroborasi kedua repo (ui-craft `purple-cyan-gradient` critical, `gradient-text-metric` major). Kalimat yang sama di entri CHANGELOG v0.3.28 dan di catatan GitHub Release v0.3.28 juga diperbaiki. Impeccable: 62 aturan = 31 slop + 31 quality (45 warning, 16 advisory, 1 error `script-error`); angka 61 adalah versi lama. Telemetri Impeccable default ON TAPI HANYA untuk roll API (concept-seed/new-work), BUKAN untuk detector (`crates/detect/` tanpa referensi telemetri). Keputusan TIDAK membundel tetap benar.
- Jendela hue `purple-gradient` diselaraskan ke upstream ui-craft: ungu **255–330°**, cyan/biru **170–255°** (dulu 240–300 + 170–200). Magenta 310° dan biru 220° yang dulu lolos kini ditandai; ungu #7C3AED (262°) tetap tertangkap. Catatan kalibrasi: indigo 243° TETAP ditandai — bukan lewat jendela ungu, tapi karena 243° masuk jendela cyan/biru (170–255); ekspektasi awal "indigo tidak ditandai" keliru secara aritmetika dan tidak bisa dipenuhi tanpa mengubah logika OR menjadi AND (aturan ui-craft asli memang AND: butuh SATU stop ungu DAN SATU stop cyan dalam gradien yang sama — itu akan melepas gradien ungu murni dan cyan murni, jadi OR + angka baru yang dipakai; perbedaannya didokumentasi di tes).
- Dua aturan baru di `checkAntiSlop` (lolos tes merah/hijau bersih, tanpa false positive pada fixture + kedua file Kopi Senja): `skipped-heading` (fail; lompatan level heading >1, mis. h1 lalu h3; heading pertama boleh level berapa saja) dan `bounce-easing` (warn; cubic-bezier dengan titik kontrol y di luar [0,1] — ADVISORY, tidak pernah menggagalkan gate). `measurePage` kini mengumpulkan `headings` (h1–h6 terlihat, urutan DOM) + `easings` (transition/animation timing function saat durasi > 0, selain `ease`/`linear`).
- `transition-all` dievaluasi dan TIDAK dimasukkan: misfire pada kedua file Kopi Senja (`transition: all var(--transition-base)` yang sah, 8 kecocokan) dan utilitas Tailwind `transition-all` ada di mana-mana (termasuk stack shadcn yang direkomendasikan design-assets); aturan ui-craft-nya adalah line-rule sumber yang tidak bisa dipindah ke gate halaman-render tanpa false positive.
- Validate OK (warns 0), test **304/0** (5 tes baru: jendela hue + skipped-heading + bounce-easing + red-test Chrome fixture `bounce-easing.html` + `measurePage` kumpulkan headings). Metrics golden 154 / L0-mismatch 0 — top-1 0,7946, recall@5 0,9643, MRR 0,8795, miss 4 (identik v0.3.28; router tidak disentuh). Red-test Kopi Senja ulang dengan gate ini: basic 45 findings / iterasi-5x 21 findings — tidak berubah, aturan baru tidak menambah findings.

## 0.3.28 — Rasa yang bisa diukur

- Token-fidelity deterministik di `harness/design-gate.mjs`: warna solid render harus sama persis dengan token yang dideklarasikan di `DESIGN.md` (source of truth arah + token); tint hanya dari token, `transparent` lolos, deklarasi rusak fail-closed. `measurePage` kini mengumpulkan `usedColors` + `backgrounds` + `gradientTexts` + `texts`; `parseDesignFile` membaca font dari baris Tipografi; `measureAndGate` menerima DESIGN.md / token langsung / `declaredFonts` / `allow`. Red-test Kopi Senja (token prompt sebagai deklarasi): basic FAIL 45 findings (13 token-fidelity) dan iterasi-5x FAIL 21 findings (13 token-fidelity) — gate kini menangkap celah yang ditemukan 2026-11-09 (file 5x lolos gate lama, tapi 0 dari 3 token prompt dipakai).
- Anti-slop deterministik native, zero-dep, offline — subset kurasi 4 aturan dari Impeccable (pbakaus/impeccable, Apache-2.0, 62 aturan built-in terverifikasi di `crates/foundation/src/registry.rs` — 31 slop + 31 quality; TIDAK dibundel karena telemetrinya ON secara default untuk roll API dan menelepon https://impeccable.style/api — detector-nya sendiri tidak punya referensi telemetri): `purple-gradient` (gradien ungu/violet + cyan, lolos bila semua stop-nya token deklarasi), `repeating-gradient`, `gradient-text`, `overused-font` (>50% teks memakai Inter/Roboto/Fraunces/Geist/Plus Jakarta Sans/Space Grotesk tanpa deklarasi di DESIGN.md). Pengecualian: bila brief meminta eksplisit, caller mengisi `allow` dengan id aturan. ui-craft (educlopez/ui-craft, MIT) PUNYA registry 43 aturan anti-slop terverifikasi di `scripts/detect/rules.mjs` (14 critical, 25 major, 2 warn, 2 minor; total gate 52) — kalimat v0.3.28 yang mengklaim sebaliknya salah, dikoreksi di v0.3.29; di v0.3.28 ini belum ada yang diambil darinya. Yang sengaja tidak masuk subset (dengan alasan di kode): nested-cards, cramped-padding, monotonous-spacing, flat-type-hierarchy, marquee (prompt benchmark sendiri mewajibkan ticker), icon-tile-stack / hero-eyebrow-chip / kicker / oversized-h1, tiny-text, codex-grid-background.
- `loopdesign` §1 direction-first: Maker menulis `DESIGN.md` (satu arah estetika + 4–6 token + tipografi + signature) SEBELUM CSS; hanya token deklarasi di CSS (warna brand yang benar-benar perlu, mis. hijau WhatsApp, harus dideklarasikan juga sebagai token). Pre-mortem 3 jebakan tetap.
- `criticInput`: kini membawa `brief` (arah + token + ringkasan brief/data), tetap membuang code/klaim/prompt — kritikus bisa menangkap pelanggaran token/brief dari screenshot + gate + brief.
- Scratch-dir (orchestrator aturan 10 + loopdesign §2): file sementara SELALU di dalam workspace (`<workspace>/.tmp/`), JANGAN `/tmp` — guard menolak `rm` di luar workspace (LUMI_DENY); `trusted` TIDAK menyelesaikan ini.
- `design-assets`: lisensi terverifikasi per sumber kode + health check 50 sumber (49 hidup, 0 mati, 1 belum terverifikasi). Aceternity UI **PROPRIETARY — BUKAN MIT** (ui.aceternity.com/licence + /terms, dibaca verbatim): end-product boleh dipakai tanpa batas (termasuk komersial), tapi dilarang mendistribusikan ulang source-nya — jangan di-vendor ke repo publik. MIT terverifikasi: shadcn, ReUI (free; Pro berbayar), Watermelon (repo `watermelon-platform`; registry lama 404), Magic UI (free; Pro berbayar), HyperUI, daisyUI, NiceUI (klaim situs, tanpa repo publik), Flowbite; 21st.dev per-component/per-author (tanpa lisensi blanket); React Bits MIT + Commons Clause; GSAP lisensi Webflow "No Charge" (bukan MIT); Astryx MIT. Jalur registry shadcn diperbaiki (`/r/styles/default/<komponen>.json`; jalur lama 404). Diagram Design ditandai "URL belum terverifikasi — jangan dipakai". Celah kategori didokumentasi (tanpa sumber Android native / Laravel-Blade / chart / stok foto; tambah sumber hanya bila ada kebutuhan nyata + lisensi terverifikasi).
- Validate OK (warns 0), test **299/0** (17 tes baru: 9 token-fidelity + 8 anti-slop, incl. red-test Chrome: token-clean PASS, token-slop FAIL 2 token-fidelity, anti-slop FAIL 4 aturan). Metrics golden 154 / L0-mismatch 0 — top-1 0,7946, recall@5 0,9643, MRR 0,8795, miss 4 (identik v0.3.27; router tidak disentuh). Uji live /loopdesign dengan model: tidak termasuk rilis ini (sudah VERIFIED di mesin Fahmi pada v0.3.26: basic FAIL → 5x PASS).

## 0.3.27 — v0.3.27 — Satu korpus

- Satu korpus: batas dorman dihapus (merge trial `trial/no-dormant`) — registry 110 → **624 skill** (514 pack, 66 cermin), lalu impor 341 nominal → **276 ready** (aktif 17 + pack baru 114 + pack lama 145; selisih = dedup 53 terverifikasi, tabrakan nama, estimasi hyperframes salah, 2 penolakan lisensi PolyForm Noncommercial: anything2explainer + video-talkcraft). Korpus akhir **900 skill** (aktif-folder 127, pack 773, cermin 66); pack baru `3d` (95) + `penulisan` (42); red-team tetap disabled (166 skill).
- Retrieval TIDAK regresi: golden 154 — top-1 0,7946, recall@5 0,9643, MRR 0,8795, miss 4 (sama persis dengan trial; L0-mismatch 0). Probe impor baru 30/30 (recall@5 1,0, top-1 0,8667, MRR 0,925) sesudah 1 putaran tuning — R0 sempat 0,9333 (2 miss: blender-director, resume-polisher). Index terukur 17.735 tok (cap total 22.400 = terukur ×1,25); `route()` FTS p50 ~1 ms.
- Perbaikan akar yang ditemukan saat impor: (1) `scripts/gen-registry.mjs` — deskripsi registry kosong menempel selamanya (guard `derived` mensyaratkan `prev.description` non-empty); blender-director terdaftar tanpa deskripsi sehingga tidak pernah ter-retrieval. Kini deskripsi kosong diadopsi dari frontmatter. (2) `router/parse.mjs` (parser naif): skalar blok `>`/`|` (lipat spasi / literal newline + chomping), map bersarang berisi list (`metadata.permissions` memutus `swanwright_*`), skalar dikutip multi-baris (`'...'` + baris kosong + `'` penutup, `''` → `'`) — paritas YAML vs naif kini 0 beda di 976 file. (3) L0: aturan CV/resume/lamaran → penulisan (hint resume-polisher; "backend developer" di prompt CV tidak lagi membelokkan ke coding) + Blender-directing → media (hint blender-director).
- Stitch MCP terdaftar (commit terpisah `115ad85`): remote MCP https://stitch.googleapis.com/mcp, media, off by default, key via `{env:STITCH_API_KEY}`, write/generate = ask.
- Validate OK (warns 0), test 282/0, metrics golden 154 / L0-mismatch 0. Uji live /loopdesign dengan model: **UNVERIFIED** (menunggu mesin Fahmi — bukan bagian rilis ini).

## 0.3.26 — v0.3.26 — Design loop

- Design loop: desain dinilai dari **gambar**, bukan dari kode — Maker bangun → render → Design-Gate ukur → kritikus red-team serang → perbaiki → render lagi (maks 3 iterasi, berhenti begitu gate lolos / tanpa perbaikan / budget habis).
- `harness/design-gate.mjs` (baru, zero-dep, pure): `evaluateDesign(input)` → `{pass, findings[]}` — kontras WCAG dari warna (teks ≥4,5:1, besar/UI ≥3:1), tap target ≥44px, overflow horizontal di viewport 1440/768/390, font/gambar gagal muat, edge-case teks (panjang/empty/loading/error), konsistensi data + lisensi aset (due diligence, fail-closed), vetting = vonis pass/fail. `nextLoopAction` mengkodifikasi aturan berhenti; `criticInput` hanya mengizinkan screenshot + hasil gate (kritikus tidak pernah menerima kode/klaim Maker).
- `harness/design-measure.mjs` (baru): renderer → input gate. `measurePage` (CDP, reuse `lib/cdp.mjs` + `lib/probe.mjs` skill design-taste-frontend; Chrome via `CHROME_PATH`), `fromInspectReport` (report.json inspect.mjs), `fromFigcraftExport` (direktori export Figcraft), `measureAndGate`. Dua renderer, satu gate — vonis sama dari renderer mana pun (dibuktikan tes).
- Skill baru `loopdesign` (sektor coding, 110 aktif): pre-mortem Maker — 3 jebakan AI-slop SEBELUM coding + komponen nyata dari `design-assets`; loop render → gate → kritik → perbaiki; kritikus sub-agent terpisah (steelman dulu → red team → devil's advocate → pre-mortem → peer review). Command baru `/loopdesign [N]` (default 3).
- Skill baru `design-assets` (sektor coding): retrieval aset jadi dari 48 sumber web — kode (shadcn, ReUI, Watermelon, 21st.dev, Magic UI, HyperUI, daisyUI, NiceUI, Flowbite, Aceternity), inspirasi (Awwwards, Mobbin, Land-book, …), token (Coolors, Typewolf, Lucide, M3, Google Fonts, Phosphor), diagram (Napkin, Excalidraw, diagrams.net, Mermaid); Astryx sebagai sumber komponen + CLI via npm (BUKAN skill vendor); guardrail copyright (struktur/pola/token saja).
- Orchestrator: tugas desain tahan DONE sampai Design-Gate lolos (satu baris, aturan 5); anti-spin maks 3 gagal tetap berlaku. `/loopdesign` TUI-first — headless `run` memakai build agent dan delegasi orchestrator headless belum terverifikasi live.
- `scripts/gen-registry.mjs`: entri lama kini menyegarkan `sha` dari frontmatter (sebelumnya `prev` dikembalikan utuh sehingga sha "" menempel selamanya — ditemukan saat mengisi sha skill baru; deskripsi/sektor TIDAK disegarkan karena itu lapisan kurasi registry dan permukaan routing FTS).
- Figcraft terverifikasi end-to-end di VM: AppImage v0.16.0 (95.283.704 B = metadata release), `--appimage-extract`, `figcraft-cli --version` → 0.16.0, convert SVG → .figcraft, export PNG 390×844; same-verdict Figcraft vs web PASS/PASS. Caveat: export Figcraft polos tanpa sidecar hanya bisa PASS (tidak ada metrik dari PNG saja); vonis FAIL via Figcraft butuh sidecar `design-gate.json`.
- Validate OK (warns 0), test 278/0 (21 tes baru: unit gate + red-test + same-verdict), metrics golden 154 / L0-mismatch 0, skills-index 2164 tok (≤2500). Red-test: `slop.html` FAIL (kontras 2.85:1, tap 30px, overflow 632>390, gambar rusak) / `fixed.html` PASS tanpa findings. Uji live /loopdesign dengan model: **UNVERIFIED** — headless `run` stall sebelum output pertama (exit 124, 3 percobaan: prompt loopdesign 90 dtk + 300 dtk, prompt trivial "Say hi" 60 dtk — ketiganya diam total; engine log menunjukkan server `serve --stdio` start lalu tidak ada baris apa pun sampai SIGTERM; jurnal kosong, 0 tool call). Provider terbukti hidup (direct call HTTP 200 dalam 5,9 dtk; preflight lolos). TUI pernah bekerja via PTY (v0.3.25) — stall ini spesifik headless `run --standalone` di VM non-TTY. Rantai loopdesign live (maker → render → gate → kritik → perbaiki → lolos) belum terbukti end-to-end dengan model; pembuktian rilis ini bertumpu pada tes lokal (red-test + Figcraft + suite).

## 0.3.25 — v0.3.25 — Startup bersih

- Startup `lumitome` (TUI) kini diam: banner sandbox (`lumitome: sandbox standard · tulis: … · guard saja`) hanya tampil bila `LUMI_VERBOSE=1` — tier tetap bisa dilihat lewat `lumitome trust` + jurnal (ARCHITECTURE.md §6 diperbarui).
- Baris status service engine ("Starting background server..." / "Restarting background server (version mismatch)...") disaring dari stderr TUI: engine mencetaknya langsung (console.log), bukan lewat logger — `--log-level none` tidak mematikannya (terverifikasi vs engine 2.2.4-lumi.1). Filter baru `lumitome/lib/quiet-stderr.mjs` (berbasis baris, tahan chunk terbelah; hanya dua baris eksak itu yang dibuang, error tetap lolos); wrapper mem-pipe stderr TUI (stdin/stdout tetap TTY asli) bila bukan verbose.
- Validate OK (warns 0), test 257/0 (6 tes baru: unit filter + source-grep + smoke test engine tiruan default/verbose), metrics golden 154 / L0-mismatch 0. Verifikasi manual: PTY (banner hilang default, muncul verbose) + engine asli (service jalan di port wrapper, baris difilter default, muncul verbose).

## 0.3.24 — v0.3.24 — Perbarui diagram arsitektur

- `docs/diagrams/arsitektur-final.mmd` + `.png` diperbarui ke keadaan v0.3.23 (sebelumnya masih 82 skill, sebelum sandbox tiers / evaluateTool / buildFinalConfig): 5 lapisan — ① Entry (lumitome.mjs 406 baris + buildFinalConfig, VERSION single-source, `lumitome update` E2E), ② Engine OpenCode 2.2.4 terpin (orchestrator → 6 sub-agen sektor → Elephant/Goldfish/Synthesizer), ③ Skill Query Layer (Layer-0 golden 154, FTS5 BM25 + RRF, Layer-1 ≤5 skill, 108 aktif / 580 dorman, indeks 2115 tok), ④ MCP deny-by-default (skills read-only, codemem/context7/playwright/chromedev/markitdown, figcraft v0.16.0 + drawio MATI, gateway MATI), ⑤ Pagar & bukti (evaluateTool, sandbox tiers, done-gate + anti-spin exit 3/4/5, scan-gate) — model hanya 9router.
- Validate OK (warns 0), test 251/0, metrics golden 154 / L0-mismatch 0.

## 0.3.23 — v0.3.23 — Dalamkan seam

- Urutan penegakan guard pindah ke guard: `harness/lumi-guard.mjs: evaluateTool(tool, input, ctx)` → `{effect, reason, rewrite}` — fail-closed → anti-spin → classifyFileTool → classifyShell → shellOutsidePaths → bwrap rewrite; plugin `lumitome-guard.ts` tinggal wiring (panggil, lempar bila deny, terapkan rewrite, jurnal) + cabang fail-closed bila guard gagal dimuat. Urutan kini bisa diuji tanpa engine (7 tes baru). `SHELL/FILE_TOOLS` dicerminkan di dua tempat (plugin harus memfilter hook saat guard gagal dimuat).
- Seam config: `lumitome/lib/build-config.mjs: buildFinalConfig(env)` — rakitan config final (mcpOverride, finalCfg + deny list, skill routing, env) keluar dari `lumitome/bin/lumitome.mjs` (512 → 406 baris); entry tinggal dispatch (subcommand, service, branding, spawn/cleanup). Auto-index + setup config dir tetap di entry (manajemen proses & persiapan filesystem, bukan rakitan config). 2 tes baru (jalur models + run dengan router L0). Smoke test: `lumitome run` tanpa pesan mencapai validasi argumen lewat buildFinalConfig (exit 2, "run butuh pesan").
- Validate OK (warns 0), test 251/0, metrics golden 154 / L0-mismatch 0.

## 0.3.22 — v0.3.22 — Bersihkan duplikasi

- Hapus 4 module harness mati (`harness/anti-spin.ts`, `quality-loop.ts`, `root-cause-gate.ts`, `post-push.ts`) — nol pemanggil (wrapper, plugin, tes); header `post-push.ts` ("The plugin reads it") ternyata tidak benar. `QualityObligation` di `io-schema/types.ts` dibiarkan (nilai skema, bukan import).
- Satu parser: `router/parse.mjs` (`frontmatter` + `frontmatterNaive` + `stripJsonc`) menggantikan 3 parser frontmatter + 2 `stripJsonc`. Parser tunggal = yang sadar-YAML (satu-satunya dengan error reporting); fallback naif kini menangani urutan blok (`permissions:` → array — celah insiden v0.3.18), map bersarang satu level (`metadata:` → `swanwright_*`, 688 file), skalar terlipat, dan unquote `''` → `'`. Paritas YAML vs naif terbukti 0 beda di 698 file frontmatter nyata (tes baru di `tests/suite.mjs`).
- Dokumen basi diperbaiki (manual, tanpa generator): `skills-<sektor>` → `skills` (ARCHITECTURE.md, docs/MCP.md, diagram arsitektur, SWANWRIGHT-README.md — plus hitungan "86 skill aktif" → 108); ROUTING.md menunjuk `layer1-select.md` (skills ≤5, bukan `layer1-prompt.md` ≤3) dan finance kini 4 skill aktif; `router/layer1-prompt.md` (file mati, 530 byte) dihapus.
- Validate OK (warns 0), test 242/0, metrics golden 154 / L0-mismatch 0.

## 0.3.21 — versi single-source + indeks digenerate

- Versi single-source: file `VERSION` satu-satunya tempat versi ditulis; `lumitome/bin/lumitome.mjs` + `install.sh` membacanya saat jalan (tidak ada lagi `const VERSION` / `SW_VERSION` hardcode — kelas bug yang merusak rilis v0.3.17 mati). `node scripts/bump-version.mjs <x.y.z> ["judul"]` menyinkronkan `package.json`/lockfile/README/CHANGELOG + verifikasi sendiri; rilis ini dibuat dengan script itu.
- Indeks skill digenerate: `router/skills-index.md` kini ditulis `scripts/gen-registry.mjs` dari registry (per sektor, alfabetis, deskripsi dipotong ~80 karakter) — bukan lagi dirawat manual; `--check` memverifikasi kesegarannya. Header basi "Finance: belum ada skill." hilang. Skills-index 2070 → 2115 tok (ambang 2500).
- Tes konsistensi versi jadi version-agnostic: membaca `VERSION`, membandingkan `package.json`/README, menjalankan `--version` asli, dan menegaskan tidak ada hardcode versi di wrapper/installer.
- Validate OK (warns 0), test 239/0, metrics golden 154 / L0-mismatch 0.

## 0.3.20 — skill external-tools + integrasi Figcraft MCP

- Skill baru `external-tools` (108 aktif): satu prosedur untuk pasang aplikasi eksternal dan hubungkan ke agent — triage permukaan integrasi (MCP stdio/remote, CLI, HTTP API, file saja, GUI saja), install per OS tanpa sudo, daftarkan MCP ke Lumitome, verifikasi. Figcraft jadi contoh kerja (grounded di `docs/mcp.md` upstream).
- Figcraft terdaftar sebagai MCP opsional (sektor media, mati default, pin v0.16.0): `router/mcp-sectors.json` + `opencode.jsonc` (disabled) + blok opt-in di `lumitome.mjs` (`LUMI_MCP=<default>,figcraft`, tidak ikut `all`), dengan confinement `--automation-read-root/write-root` = folder sesi. Nyalakan setelah `figcraft-cli` terpasang (AppImage: `FigCraft.AppImage cli mcp`).
- Efisiensi (sesuai permintaan): skill hanya Markdown 118 baris, tanpa script/dependensi/proses baru; Figcraft mati default (nol biaya RAM/CPU saat tidak dipakai); skills-index 1993 → 2070 tok (ambang 2500). Validate OK, test 239/0 (1 tes baru: wiring Figcraft), metrics golden 154 / L0-mismatch 0; routing "pasang figcraft" → #1 external-tools.

## 0.3.19 — tier sandbox + SSH deploy

- Sandbox jadi tiga tier kepercayaan (`lumitome trust [strict|standard|trusted]`): `strict` = perilaku lama (tulis folder kerja + bwrap, fail-closed bila bubblewrap tidak ada); `standard` = default baru (aturan tulis sama, guard saja, tanpa bwrap — tidak ada lagi fail-closed karena bwrap tidak terpasang); `trusted` = tulis selebar akar proyek (terdeteksi dari `.git`/`opencode.jsonc`/`MEMORY.md`/`.lumitome`, maks 5 tingkat ke atas, tidak melewati `$HOME`).
- Tier disimpan di `~/.lumitome/trust.json` (di luar workspace, kunci = akar proyek) dan di-mask dari agent — agent tidak bisa membaca/mengubah tier-nya sendiri. Env `LUMI_TRUST_TIER` menang atas file. Perintah `lumitome trust` menampilkan tier + cakupan tulis + aturan SSH proyek ini.
- Perbaikan kasus Bindo: `MEMORY.md` di folder induk (sampai 5 tingkat ke atas) kini bisa ditulis sebagai file, tanpa membuka seluruh folder induk.
- Kinerja: pemindaian file rahasia kini di-cache per proses (TTL 5 menit) — perintah shell pertama membayar jalan kaki penuh (~4,2 detik di VM build), perintah berikutnya ~0,6 ms (sebelumnya ~866 ms per perintah).
- SSH deploy: di tier standard/strict, `ssh`/`scp`/`sftp` hanya boleh dengan `-i` kunci deploy di `~/.lumitome/` (dibuat via `lumitome trust --deploy-key`, bukan `id_*`, bukan `~/.ssh/`); tier trusted membebaskan ssh; `ForwardAgent` hanya di trusted. `sudo` lokal tetap ditolak di semua tier; `sudo` di VPS tidak diatur sandbox (berjalan di server).
- Catatan: v0.3.16 menghapus deteksi akar proyek + `sandbox.json` karena config-nya hidup di dalam workspace (agent bisa melonggarkan kurungannya sendiri). v0.3.19 mengembalikan deteksi akar saja (perhitungan path murni, tidak membaca config) dan menyimpan trust di luar workspace — bukan mengembalikan `sandbox.json`.
- Tes: 224 → 238 (14 tes baru: tier, root, MEMORY.md, cache, SSH, sudo, trust ter-mask, CLI trust). Validate OK, metrics golden 154 / L0-mismatch 0.

## 0.3.18 — validate + test hijau

- Perbaikan kegagalan lama (sudah ada sejak clone bersih): `npm run validate` FAILED 12 dan `npm test` 221/3 — akar masalahnya devDependencies belum terpasang (`ajv` + `yaml` hilang karena `node_modules` kosong; tanpa `yaml`, parser frontmatter cadangan membaca `permissions` sebagai string, bukan array) dan deskripsi `packs/misc/skills/claude-api` 1027 karakter melewati batas 1024. Sekarang: validate OK (warns 0), test 224/0; deskripsi claude-api dipotong jadi 1005 karakter.
- Catatan: perbaikan ini tidak mengubah skill — hanya lingkungan (`npm install`) + satu baris deskripsi.


## 0.3.17 — 18 skill aktif + pack motion (107 aktif)

- Skill aktif 89 → 107: `speckit-code-review`, `logo-design`, 6 skill `antislop-*`, `stack-diagram`, `floorplan`, 8 skill `effective-html-*`.
- Skill baru: `docs-pack` (interview → 12 dokumen proyek) + slash `/docs-pack`, dan `stitch-ui` (gambar referensi → design.md + Stitch prompt + index.html) + slash `/stitch-ui`. Stitch/Gems/Vcraft adalah tool eksternal — skill hanya menghasilkan artefak.
- Pack motion baru (dorman, 51 skill): `video-shotcraft`, `motionmaxxing`, `animate-video`, `motion-designer`, `openshorts`, `lemo-opuscar`, `directing-stickman-videos`, 9 skill `papercut-*`, 35 skill `reelmimic-*`.
- Perbaikan rilis: versi di `VERSION`, `package.json`, `lumitome.mjs`, dan `install.sh` sempat tertinggal di 0.3.16 sehingga `lumitome update` ke v0.3.17 gagal di verifikasi rilis; sekarang konsisten 0.3.17 (cek di `tests/suite.mjs`).
- Aturan repo diluruskan: push ke `main` boleh untuk perubahan skill lokal yang sudah terverifikasi; PR tetap untuk arsitektur/harness. Ambang token indeks skill naik ke 2500 (terukur 1993 tok).

## 0.3.16 — Sandbox seperti Codex: baca $HOME, tulis folder kerja

- Default baru, aktif tanpa config: seluruh `$HOME` dan path sistem bisa dibaca (read-only), hanya folder kerja yang bisa ditulis (plus `/tmp` sementara). Proyek di `~/Documents` bisa membaca file di `~/Downloads`, tapi tidak bisa menulis ke sana.
- Dihapus: deteksi akar proyek (`.git`, `MEMORY.md`, `AGENTS.md`, `.lumitome/workspace`) dan `.lumitome/sandbox.json`. File `sandbox.json` yang sudah ada diabaikan.
- Folder rahasia di `$HOME` disamarkan di bwrap dan ditolak di tool file host dan perintah shell: `~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.azure`, `~/.kube`, `~/.config/gcloud`, `~/.docker/config.json`, keyring, profil/cookie browser (Chrome, Chromium, Brave, Edge, Firefox), `~/.lumitome/credentials.json`, `.netrc`, `.npmrc`, `.git-credentials`. File `.env` di bawah `$HOME` juga di-mask (pencarian dibatasi kedalaman 4).
- Tool file host dan cek path shell memakai aturan yang sama. Tulis di luar folder kerja (redirect, `tee`, `cp`, `mv`, `touch`, edit/patch) ditolak dengan `LUMI_SANDBOX_OUTSIDE`. Windows memakai aturan yang sama dengan `%USERPROFILE%`.
- Di dalam bwrap `HOME` sekarang `$HOME` asli (read-only); cache diarahkan ke `/tmp/.cache`.

## 0.3.15 — Sandbox bisa membaca folder induk proyek

- Masalah: sandbox bwrap hanya memasang folder kerja. Tool cari/baca melihat file di folder induk (mis. `../../Template Laporan.docx`), tapi `python` di shell mendapat `FileNotFoundError`.
- Lumitome sekarang mencari akar proyek: naik dari folder kerja sampai menemukan `.git`, `MEMORY.md`, `AGENTS.md` atau `.lumitome/workspace`. Tidak pernah melewati `$HOME`, dan `/` atau `$HOME` tidak pernah jadi akar. Tanpa penanda, akar = folder kerja.
- Di bwrap, akar proyek dipasang read-only, folder kerja tetap bisa ditulis. File rahasia di akar tetap disamarkan.
- Config opsional `.lumitome/sandbox.json`: `{"read":[...],"write":[...]}`. `~` dan path relatif (terhadap akar) didukung. `/` ditolak, write ke `$HOME` ditolak.
- Tool file host (read/grep/edit/write/patch) memakai daftar path yang sama. Tulis di luar folder kerja, atau baca di luar akar, ditolak dengan pesan `LUMI_SANDBOX_OUTSIDE` yang menyebut cara mengizinkannya. Shell yang menyebut path `~/...` atau `../...` di luar sandbox juga ditolak dengan pesan yang sama. Aturan ini juga berlaku di Windows (tanpa bwrap) untuk tool file.
- Belum ada dialog izin (sekali / selalu / tolak); plugin guard hanya bisa menolak. Izin permanen lewat `sandbox.json`.

## 0.3.14 — `lumitome update` yang sederhana

- Tampilan baru: logo LUMITOME emas, satu baris status dengan spinner (Memeriksa, Mengunduh, Memasang, Merapikan), lalu satu baris hasil `Selesai — vX.Y.Z`. Kalau sudah terbaru: satu baris `Sudah versi terbaru`. `--check` juga satu baris.
- Error tampil sebagai satu kalimat singkat plus saran. Detail teknis selalu ditulis ke `~/.lumitome/logs/update.log`, dan tampil di layar dengan `--verbose` atau `LUMI_DEBUG=1`.
- Instalasi npm: `lumitome update` sekarang menjalankan `npm install -g` ke tarball rilis sendiri. Output npm hanya masuk ke log.
- Sesudah update, config dimigrasi dan service latar lama milik Lumitome dihentikan otomatis. Tidak perlu lagi mematikan proses lewat PowerShell.
- Terminal non-TTY / CI: baris polos tanpa animasi dan tanpa warna. Konsol Windows non-UTF-8 atau `LUMI_ASCII=1`: spinner dan logo ASCII.
- Backup, rollback otomatis bila versi baru gagal jalan, dan `--rollback` tetap sama. Engine tidak diubah.

## 0.3.13 — Lumitome terbuka lebih cepat; model langsung tampil

- Penyebab terbesar: plugin guard memuat modul harness dengan import relatif literal. Dari salinan di `~/.lumitome/config/plugins`, path itu tidak ada, sehingga engine memantau folder induk terdekat secara rekursif (mis. `C:\Users` atau `/home`) setiap folder dibuka. Import sekarang dibangun saat runtime. Tidak ada `.git` yang dibuat di folder user, dan engine tidak diubah.
- Service latar milik Lumitome tidak lagi dimatikan saat keluar (Linux), dan dipakai ulang lintas folder. Service dimulai ulang otomatis bila config, key provider, atau versi berubah. Perintah baru: `lumitome service status`, `lumitome service stop`. Service OpenCode milik user tidak disentuh.
- Guard memakai folder sesi yang sedang dibuka sebagai workspace (sebelumnya folder pertama yang membuka service).
- Empat MCP `skills-<sektor>` digabung jadi satu proses `skills` untuk semua sektor. Tool menjadi `<sektor>_skill_search`; agent sektor hanya boleh tool sektornya. Skill offensive tetap `ask`.
- codemem hanya berjalan di repo git (lewat shim kecil; di luar git MCP-nya kosong). Auto-index juga hanya di repo git. Batas start 60 s → 15 s. stderr codemem ditulis ke `~/.lumitome/logs/codemem.err`.
- Perbaikan: pesan timeout `lumitome run` memakai variabel `idle` yang terhapus di 0.3.11.
- Diukur di Linux (box): waktu sampai model tampil 12,2 s → 1,7 s (folder non-git pertama), 12,8 s → 1,4 s (folder non-git lain), 3,5 s → 1,4 s (git).

## 0.3.12 — 401 "Invalid/Missing API key" di server latar; compaction.buffer valid

- Config dasar memakai `{env:NINEROUTER_API_KEY}`, padahal wrapper hanya mengisi `LUMI_KEY_9ROUTER` dari `credentials.json`. Server engine yang berjalan tanpa variabel itu mengirim key kosong ke 9router. Sekarang config dasar memakai `{env:LUMI_KEY_9ROUTER}`, dan wrapper selalu mengisi `LUMI_KEY_9ROUTER` dan `NINEROUTER_API_KEY` (dari env atau `credentials.json`) untuk semua perintah, termasuk `lumitome serve --service`.
- `compaction.buffer: "20%"` tidak valid di engine 2.2.4 (hanya integer token; persen baru ada di 2.2.5). Diganti `20000`.
- Salinan config lama di `~/.lumitome/config/opencode.jsonc` dimigrasi otomatis saat `lumitome update` dan saat `lumitome` dijalankan. Key tidak pernah ditulis ke file config.

## 0.3.11 — Jawaban panjang tidak lagi terputus "Timed out waiting for response data"

- Sebelumnya wrapper memasang batas jeda antar-chunk 60 detik ke provider. Model reasoning lewat proxy (mis. 9router) bisa diam lebih lama di tengah jawaban, lalu request diputus, di-retry, dan pesan ditandai interrupted.
- Default baru, sama untuk 9router dan semua provider custom: `LUMI_HEADER_TIMEOUT_MS`=300000 (header), `LUMI_IDLE_TIMEOUT_MS`=900000 (jeda antar-chunk), `LUMI_TOTAL_TIMEOUT_MS`=3600000 (total). Bisa ditimpa lewat env; nilai tidak valid kembali ke default. Engine tidak diubah.

## 0.3.10 — `lumitome connect` membuka layar provider; logo tidak dobel

- `lumitome connect` di terminal sekarang membuka layar provider yang sama dengan `lumitome provider`. Mode teks lama hanya untuk non-TTY, `lumitome connect --text`, atau bila flag (`--type/--name/--base-url/--key-env/--key-stdin/--list/--remove`) dipakai.
- Banner wrapper ("The book of light…") tidak lagi dicetak sebelum TUI; wordmark LUMITOME dari engine cukup. Judul jendela tetap `Lumitome`. Pesan Windows soal sandbox hanya muncul dengan `LUMI_DEBUG=1`.
- Konsol Windows yang bukan UTF-8 (codepage ≠ 65001, di luar Windows Terminal) memakai simbol ASCII di layar provider: `*` untuk key, `x` untuk hapus, logo teks. Paksa dengan `LUMI_ASCII=1` / `LUMI_ASCII=0`.

## 0.3.9 — Layar provider; API key tampil sebagai •

- BARU layar provider (`lumitome/lib/provider-ui.mjs`, Node murni): logo LUMITOME emas, daftar provider tersimpan (`nama  N model  ×`, Del → konfirmasi y), form Tipe (OpenAI · Anthropic compatible) / Nama / Base URL / API Key, status `✓ Terhubung · N model terdeteksi`. Muncul otomatis saat `lumitome` dibuka tanpa provider; buka lagi dengan `lumitome provider`. Penyimpanan sama dengan `lumitome connect` (providers.json + credentials.json 0600, key lewat env ke engine).
- PERBAIKAN Windows: API key di `lumitome connect` tidak lagi kosong/tak terlihat; tampil • per karakter. Backspace `\b` dan DEL, Enter CRLF, bracketed paste dan paste biasa ditangani.
- Batasan: `/provider` di dalam TUI engine belum ada (butuh patch engine); di TUI tetap ada `/connect` bawaan OpenCode.

## 0.3.8 — Logo LUMITOME di layar awal; hanya logo yang emas

- Engine sekarang build Lumitome dari OpenCode v2.2.4 (tag upstream `v2.2.4`, commit 45898d0). Satu-satunya perubahan: tulisan blok di layar awal jadi `LUMITOME` berwarna emas (`LUMI` emas tua + `TOME` champagne). Patch: `engine/patches/logo.patch`. Binary dibangun dengan skrip build upstream (Bun 1.4.4) dan dirilis di `engine-2.2.4-lumi.1` (linux x64/arm64, darwin x64/arm64, windows x64/arm64), terpin SHA256 di `lumitome/lib/engine.mjs` dan `install.sh`.
- Theme kembali ke tampilan bawaan OpenCode; theme `lumitome` tidak lagi di-seed. Instalasi v0.3.7 dilepas dari theme `lumitome` sekali saja (penanda `$LUMI_HOME/config/.theme-default-v038`); kalau dipilih lagi lewat `<leader>t`, pilihan itu dihormati.
- `LUMI_ENGINE=upstream` → pakai binary resmi OpenCode v2.2.4 (pin lama). Engine lama tidak dihapus bila unduhan gagal; tanpa engine dan build Lumitome gagal → otomatis jatuh ke upstream. `lumitome engine` menampilkan build yang terpasang. Auto-update engine tetap mati.

## 0.3.7 — Branding Lumitome (white-gold / champagne)

- BARU theme OpenCode `lumitome` (`lumitome/config/themes/lumitome.json`, varian dark & light) dari palet brand kit `assets/brand` (#FFF8DC → #F3D27A → #E8C266 → #C9962E → #9C6F17). Jadi default lewat `cli.json` terisolasi di `$LUMI_HOME/config`; theme yang dipilih user (`<leader>t`) dihormati. Logo layar awal ikut berwarna emas.
- Judul jendela/tab terminal = `Lumitome` (OSC 0; `terminal.title: false` agar engine tidak menimpanya dengan "OpenCode"). Linux, macOS, Windows Terminal/PowerShell.
- Banner `Lumitome` gradasi white-gold → champagne saat TUI dibuka (truecolor, fallback 256 warna, polos bila `NO_COLOR`/non-TTY/`TERM=dumb`). Matikan semua branding: `LUMI_NO_BRAND=1`.
- Batasan: tulisan blok "opencode" di layar awal di-hardcode di engine v2.2.4 (`packages/tui/src/logo.ts`, tanpa config/slot plugin). Binary engine tetap terpin SHA256 & tidak dipatch.


- BARU skill `drawio-diagram` (sektor penulisan): diagram draw.io/diagrams.net (.drawio, .drawio.svg), berbasis [DayuanJiang/next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io) @ `c9dc5f5` (Apache-2.0). Alias id/en ("diagram draw.io", "diagrams.net", "aws diagram", …). Skill aktif: 87.
- BARU MCP opsional `drawio` (`@next-ai-drawio/mcp-server@0.4.11`, terpin): mati default, tidak ikut `LUMI_MCP=all`; nyalakan dengan menyebutnya, mis. `LUMI_MCP=codemem,skills-coding,skills-riset,skills-penulisan,skills-security,drawio`. Tool `drawio_*` hanya untuk sektor penulisan.

## 0.3.6 — Default baru: orchestrator, 5 MCP, code memory di mana saja

- Default MCP: `codemem`, `skills-coding`, `skills-riset`, `skills-penulisan`, `skills-security`. `skills-finance`/`skills-media` hanya lewat `LUMI_MCP=all` atau daftar eksplisit. Skill `*offensive*` tetap `ask`.
- `codemem` (codebase-memory-mcp v0.12.1) kini didaftarkan wrapper secara global dengan path absolut `$LUMI_HOME/bin/codebase-memory-mcp[.exe]` — aktif di proyek mana pun, tidak lagi hanya dari config proyek Swanwright. Binary tidak ada → dilewati dengan satu baris pemberitahuan. `codebase-memory-mcp install` tidak pernah dijalankan.
- npm/Windows: postinstall & first-run memasang codebase-memory-mcp v0.12.1 (SHA256 terpin per platform: linux/darwin/win32 × x64/arm64). Gagal unduh tidak fatal.
- Auto-index: `lumitome` (TUI/run) di folder proyek yang belum diindeks memulai `codebase-memory-mcp cli index_repository` di latar (detached, prioritas rendah). Dilewati di HOME, root, folder sistem, atau tanpa penanda proyek (.git, package.json, pyproject.toml, go.mod, Cargo.toml, …). Status di `$LUMI_HOME/codemem-index.json`. Matikan: `LUMI_AUTO_INDEX=0`.
- Agent default TUI = `orchestrator` (deskripsi agent kini "Lumitome"). `lumitome run` headless tetap `build`. `LUMI_AGENT` tetap menimpa.
- FIX registry skill: `router/skills-registry.json` berisi 121 entri padahal skill aktif 86. Penyebabnya: importer lama memindai semua SKILL.md upstream, termasuk salinan per-harness (`.trae/`, `.agent/`, `.rovodev/` …), lalu memberi akhiran -2..-25 dan memasukkan entri pack ke registry aktif. Sekarang registry dibangkitkan `scripts/gen-registry.mjs` (`npm run skills:registry`) dan isinya sama dengan folder `.opencode/skills`. Metadata pack pindah ke `packs/<pack>/registry.json`. Salinan cermin (66, mis. `impeccable-2..25`, `design-2`) ditandai `mirror_of` dan tidak diindeks router; foldernya tetap ada. `validate` memeriksa registry == folder. Presisi router (test) tetap 0.938.

## 0.3.5 — Perbaikan Windows

- FIX Windows: `lumitome` gagal dengan ERR_UNSUPPORTED_ESM_URL_SCHEME karena import() dinamis menerima path mentah `C:\...`. Kini semua memakai pathToFileURL (wrapper + plugin guard).
- FIX Windows: LUMI_TOOLDIRS dipisah dengan path.delimiter (`;`), bukan `:`.

## 0.3.4 — Rilis tag untuk perbaikan pasca-0.3.3

- postinstall npm lebih aman (tidak menggagalkan instalasi bila unduh engine gagal; dicoba lagi saat first-run).
- `lumitome update` pada instalasi npm kini menyarankan `npm install -g https://github.com/fahmi0812/Lumitome/tarball/main` (bukan `github:` yang bisa gagal).
- README: instalasi npm via tarball GitHub.

## 0.3.3 — Port service sendiri + instalasi npm (Windows)

- FIX: `lumitome` (TUI) gagal dengan `Managed service port 49374 ... already in use` bila OpenCode milik user (`opencode serve --service`) sedang jalan. Penyebab: TUI OpenCode 2.2.4 memakai background server ("managed service") dengan port default 49374; state & registrasi Lumitome sudah terpisah, tapi port tidak. Kini wrapper menulis port milik Lumitome ke `$LUMI_HOME/config/service.json` (deterministik per LUMI_HOME, 50000–59999; pindah otomatis bila terpakai proses lain; override `LUMI_SERVICE_PORT`). Registrasi service tetap di `$LUMI_HOME/state/opencode/`. Service milik user tidak pernah dipakai ulang, disentuh, atau dimatikan.
- BARU instalasi npm untuk Windows/macOS/Linux: `npm install -g https://github.com/fahmi0812/Lumitome/tarball/main` (tarball GitHub, tanpa Git; nanti `npm install -g lumitome`). Bentuk `github:`/`git+https:` tidak disarankan: `github:` mencoba SSH dulu, dan npm 10 global-install dari git membuat symlink ke folder sementara. Bin `lumitome` = `lumitome/bin/cli.mjs` (Node, tanpa bash). postinstall/first-run mengunduh engine OpenCode 2.2.4 untuk platform (linux/darwin x64/arm64, win32 x64/arm64), verifikasi SHA256 terpin, simpan di `~/.lumitome` (`%USERPROFILE%\.lumitome`). Tanpa auto-update.
- Wrapper aman untuk Windows: `opencode.exe`, junction/salin alih-alih symlink, tanpa `/proc`/`setpriv`/`sleep`; tanpa bwrap → sandbox OS mati, guard Lumitome tetap aktif.
- Config dir tidak lagi bergantung pada symlink `lumitome/config/{skills,agents,commands,rules}` (hilang di paket npm/checkout Windows).
- `lumitome update` pada instalasi npm menampilkan perintah npm. `upgrade-engine` memakai unduh+verifikasi yang sama (zip Windows/macOS, tar.gz Linux).
- Tes regresi: port service vs listener di 49374 (unit + e2e engine asli `service start`), path Windows, SHA256 salah ditolak, paket npm.

## 0.3.2 — Rules inti + `lumitome update`

- Rules inti Lumitome (`lumitome/rules/00-core.md`, `01-safety.md`, ±0.8k token): sintesis Karpathy, superpowers, poteto, grokbot-field-notes, Canny, dll (atribusi + SHA di docs/RULES.md). Selaras auto-mode: asumsi dicatat, tanya hanya untuk risiko merusak.
- FIX: rules, agents, dan commands sebelumnya tidak termuat di bawah wrapper (config proyek mati, config Lumitome tanpa `instructions`). Kini dimuat dari config dir Lumitome (`$LUMI_HOME/config/{rules,agents,commands}`) di proyek mana pun.
- BARU `lumitome update [--check] [--to vX.Y.Z] [--sha <commit>] [--yes] [--rollback]`: tag rilis terbaru dari origin. Alurnya: clone tag → verifikasi commit = sha tag dan VERSION = tag → swap atomik dengan backup → cek pasca-pasang → rollback otomatis bila gagal. Engine OpenCode tidak disentuh dan tidak ada auto-update.
- Onboarding provider:
  - `lumitome` (TUI) kini terbuka tanpa env/provider. Tanpa provider muncul prompt: `c` → wizard, Enter → TUI (`/connect` bawaan OpenCode).
  - `lumitome connect`: Custom OpenAI-compatible / Anthropic-compatible, boleh banyak provider. Model dideteksi otomatis (GET /models; Anthropic memakai x-api-key + anthropic-version + paginasi) dan muncul di `/model`.
  - Perintah kelola: `--list`, `--remove`, `lumitome models --refresh`.
  - Key disimpan di `$LUMI_HOME/credentials.json` 0600, masuk config hanya sebagai `{env:LUMI_KEY_*}`, tidak pernah dicetak; guard menolak `*LUMI_KEY_*`.
  - `run` tanpa provider → exit 2 dengan pesan jelas.
- Agent orchestrator/sektor tidak lagi merujuk `scripts/skill-query.mjs` (path repo). Skill dipilih router Lumitome sebelum run; MCP `skill_search` (`skills-<sektor>`) didaftarkan wrapper dengan path absolut instalasi, sehingga tersedia di proyek mana pun.
- README (brand kit tetap): Quickstart install → `lumitome` → `lumitome connect`, bagian Updating.
- Wrapper memblok `upgrade`/`update`/`uninstall` milik engine OpenCode (engine terpin).
- Pengguna v0.3.1 (belum punya `lumitome update`): jalankan ulang one-liner installer sekali; installer menarik main terbaru ke `~/.lumitome/src`.

## 0.3.1 — Router skill L0-first

- Pengayaan 86 skill aktif: alias id+en terkurasi (`router/skills-aliases.json`), sinonim dwibahasa & 3–5 contoh permintaan per skill dibangkitkan otomatis saat indeks (`router/enrich.mjs`; dump: `node scripts/skill-enrich.mjs`).
- Retrieval L0 baru (`router/l0.mjs`): FTS5 BM25 unicode61 (nama/alias/sinonim/contoh/short/deskripsi) + koreksi typo trigram + daftar kemiripan trigram + hint Layer-0 → RRF.
- L1 kini cadangan: hanya saat confidence rendah (margin BM25 < 0.15 / tanpa hit), timeout keras 3 s → L0, kandidat top-8 L0. `LUMI_ROUTER_L1=auto` default.
- Cache pilihan per query ternormalisasi di `$LUMI_HOME/router-cache.json` (TTL 7 hari, invalid saat katalog berubah).
- Eval v2 (`tests/router-eval-v2.json`, dev/test, ditulis sebelum tuning) + `tests/router-eval2.mjs`.

## 0.3.0 — Lumitome (repo mandiri)
- Rebrand ke **Lumitome**; installer `fahmi0812/Lumitome`, `LUMI_HOME=~/.lumitome`, launcher `~/.local/bin/lumitome`, `install.sh --uninstall`.
- Engine OpenCode v2.2.4 terpin + SHA256, terisolasi (XDG_* sendiri), autoupdate mati, `lumitome engine` / `upgrade-engine`.
- Proyek untrusted by default (`LUMI_TRUST_PROJECT=1` opt-in); serve password 0600 tanpa cetak.
- Fail-fast provider (preflight, watchdog 90 s, deadline 5 menit, kill eskalasi).
- 4 skill finance dasar; router fallback top-3, L1 cache/compact (opt-in); permintaan trading tanpa skill.
- Guard: daftar nama `.env*` boleh; anti-spin per-signature; done-gate mendeteksi exit tes yang disamarkan.


## 0.1.6 — 2026-10-31 — Arsitektur final (disetujui Fahmi)
Basis v0.1.5 (backup `pkg.bak-0.1.5`). OpenCode **v2.2.4**. Skill aktif tetap **82**; api-security & llm-security tetap nonaktif. Riset acuan: `swanwright-research/REPORT.md`, `MCP-REPORT.md`.

### Skill Query Layer (desain v0.2 fase 1)
- `router/skill-db.mjs` (tanpa dependensi wajib; `node:sqlite`): tabel `skill`, `skill_fts` (FTS5 BM25), `skill_vec` (sqlite-vec 0.1.9, optionalDependency, hanya bila ada embedding), `agent_policy`, `allowed_skill`, `skill_edge`, `route_log`, `meta`.
- Filter SQL sektor/pack/status/izin SEBELUM ranking → query ganda → BM25 (+vec) → RRF k=60 → dedup (61 duplikat pack) → top-24 (16–32) → 1 panggilan 9router pilih-saja (≤5, JSON tervalidasi) → fallback deterministik bila 9router mati → `route_log`.
- `scripts/skill-index.mjs --if-changed|--check` (rebuild saat hash berubah), `scripts/skill-query.mjs`, `scripts/skill-metrics.mjs` (recall@k, top-1, MRR, zero-load, latensi).
- `router/skill-search-mcp.mjs`: MCP stdio read-only `skill_search`, satu server per sektor (`skills-<sektor>`).
- `router/layer1-select.md`: prompt pilih-saja. Layer-0 tidak diubah (golden 154, 0 mismatch).

### MCP per sektor
- `router/mcp-sectors.json` + `scripts/gen-policy.mjs` → frontmatter `permissions` 10 agent: `*_*` deny → `external_directory` ask → allow server sektor sendiri; `codemem_delete_project`/`manage_adr` = ask; tool tulis github = ask; skill: deny `*` lalu allow allowlist sektor.
- Server: context7 4.4.4, codemem (codebase-memory-mcp v0.12.1, didaftarkan manual), playwright-mcp 0.0.83, chrome-devtools-mcp 1.12.0, markitdown-mcp 0.0.1a8 (aktif); figma remote (OAuth) & github remote (token env) **mati**; `gw-<sektor>` gateway opsional **mati** (template Docker MCP Gateway & ContextForge di `config/mcp-gateway/`). Tanpa Kali, tanpa trading.
- Global: deny `codebase-memory-mcp install|update`; plugin juga memblok. Provider 9router sekarang `{env:SW_9ROUTER_URL}`/`{env:SW_9ROUTER_KEY}`.
- `checkMcpPolicy` di validate: token literal, `@latest`, paket tak dipin, figma/github/gateway enabled, server terlarang, Code Mode dimatikan → FAIL.

### Pemasangan
- `install.sh` (Linux/macOS/WSL2; Windows native ditolak dengan instruksi WSL): OpenCode v2.2.4, Node 22.23.4, codebase-memory-mcp v0.12.1, uv 0.13.6 — SHA256 terpin + file checksum rilis; `~/.swanwright/{bin,env.sh,secrets.env(600)}`; `npm ci`; bangun indeks; idempoten; tidak menulis `~/.config/opencode`.
- `scripts/doctor.sh` (`bash install.sh --doctor`): skill=82, MCP connected, plugin active, agents, skill_search, 9router. `scripts/e2e-opencode-v2.sh` kini memanggil doctor.

### Dokumen
- `ARCHITECTURE.md` (root, final) + `docs/diagrams/{arsitektur,orchestrator}-final.{mmd,png}`, `docs/MCP.md`, `docs/MCP-GATEWAY.md`, `docs/VERIFY-OPENCODE.md` (output mentah v0.1.6).
- Tes 59 → 83.

### Isu diketahui
- Layer-1 nyata (9router) & embedding semantik belum diuji: 9router tidak hidup di box. Metrik = retrieval tanpa L1.
- Gateway (Docker/ContextForge) belum diuji (tanpa Docker di box); endpoint `/mcp` & token = [VERIFIKASI].
- figma/github tidak diuji (butuh OAuth/token).

## 0.1.5 — 2026-10-31
### Migrasi ke OpenCode v2 (disetujui Fahmi)
Diuji pada **OpenCode v2.2.4** (rilis GitHub anomalyco/opencode `v2.2.4`, 2026-10-30 23:59 WIB; tarball `opencode-linux-x64.tar.gz`, SHA256 cocok `SHA256SUMS`). Catatan: npm `opencode-ai@latest` masih 1.19.5; paket v2 = `@opencode/cli` / `@opencode/plugin` 2.2.4.

Sumber: https://opencode.ai/v2/docs/migrate-v1/ , https://opencode.ai/v2/docs/build/plugins/migrate-v1/ , https://opencode.ai/v2/docs/skills/ , /v2/docs/permissions/ , /v2/docs/mcp-servers/ , /v2/docs/agents/ , /v2/docs/plugins/ .

Breaking change v2 yang berdampak ke Swanwright:
- **Plugin API** (breaking resmi): plugin V1 (`export const X = async () => ({"tool.execute.before": …})`) tidak jalan di v2. → `swanwright.ts` kini `export default` `{ id: "swanwright", setup(ctx) { ctx.tool.hook("execute.before", guardPushMain) } }`; event `{tool, input}`; nama tool `shell` (alias `bash` tetap dicek).
- **Permissions**: map `permission` → array berurutan `permissions: [{action, resource, effect}]`; `bash`→`shell`, `task`→`subagent`, `write/patch`→`edit`. `external_directory` default v2 = allow → Swanwright set eksplisit `ask`. Tambahan deny `shell git push *main*|*master*`.
- **Agents**: frontmatter `permission` → `permissions` (orchestrator: deny edit `task_plan.md`/`findings.md`, allow `subagent *`).
- **MCP**: server pindah ke `mcp.servers.<nama>`, `enabled` → `disabled`, `timeout: {catalog, execution}`.
- **Providers**: `provider/npm/options` → `providers/package: "aisdk:@ai-sdk/openai-compatible"/settings` (9router tetap satu-satunya provider).
- Skills: lokasi `.opencode/skills/<id>/SKILL.md` tetap; v2 memakai nama folder sebagai id (aturan nama=folder dipertahankan sebagai lint).
- Lokasi config tidak berubah; skema `https://opencode.ai/config.json` gabungan V1+V2 (field V1 `deprecated`). `tui.json`→`cli.json` tidak dipakai Swanwright.

Perubahan lain:
- `scripts/check-opencode.mjs`: `checkV2Config` (tolak kunci V1 `permission/agent/mode/provider/plugin/command/tools`, `mcp.<nama>` langsung, `enabled`), agents tolak `permission/tools/prompt`, plugin wajib `export default` + `id` + `setup`.
- `scripts/e2e-opencode-v2.sh`: E2E nyata via `opencode serve` + HTTP API (`/api/skill`, `/api/mcp`, `/api/plugin`).
- Tes 54 → 59. Skill aktif tetap **82** (tidak dipotong/ditambah); api-security & llm-security tetap nonaktif. Rules, done-gate, scan-gate, routing (golden 154, 0 mismatch) tidak berubah.

### Isu diketahui
- `opencode mcp list` / `opencode plugin list` (CLI v2.2.4) mencetak "No MCP servers configured" / "No plugins found" untuk config proyek, padahal API server untuk direktori yang sama melaporkan context7 `connected` & plugin `active`. Verifikasi pakai API.
- Hook push-main di-tes unit (mock `ctx.tool.hook`); belum dipicu lewat sesi model nyata (butuh 9router hidup).

## 0.1.4 — 2026-10-31
### Dipulihkan (disetujui Fahmi)
- Catatan koreksi: v0.1.1 memangkas skill aktif 83 → 48 **tanpa persetujuan Fahmi** (demi target token indeks). v0.1.4 memulihkan cakupan: 34 skill dipindah dari pack ke `.opencode/skills` → **82 aktif** (target 84; 2 ditolak, lihat bawah).
- coding (workflow): brainstorming, code-review, requesting-code-review, receiving-code-review, finishing-a-development-branch, dispatching-parallel-agents, git-guardrails-claude-code, improve-codebase-architecture, correct, reflect, poteto-mode, in-your-own-words, react, next, skill-creator.
- coding (design UI): design-taste-frontend, emil-design-eng, hallmark, magic-ui, gsap-core, gsap-scrolltrigger.
- security: code-audit (SAST defensif).
- riset: research, figure-it-out, interrogate. penulisan: doc-coauthoring, laporan-generator, internal-comms, technical-writer. media: motion-design, video-demo, sound-design, web-sims, review-loop.
### Tidak diaktifkan
- `api-security`, `llm-security` (zhaoxuya520/reverse-skill): ofensif — langkah serangan aktif (JWT alg:none, brute force, bypass rate-limit/DoS; payload prompt-injection, "simulasi serangan red team", cari teknik eksploit terbaru) dan instruksi "langsung eksekusi, jangan berhenti di konfirmasi". Tetap di pack `red-team` (butuh consent+scope).
### Routing
- Registry: entri baru dengan champion/fallback, trigger spesifik, deskripsi ringkas Indonesia, `activated_in`, `from_pack`. Indeks dikelompokkan per sektor (~1.470 token).
- Layer-0: 16 rule baru (media/penulisan/riset/security/coding) + skillsHint. GSAP di-route ke executor `media` agar golden lama `media-05/10/15/20` tetap benar; skill gsap-* tetap tercatat sektor coding.
- Golden 134 → 154 (20 kasus `v014-*` dengan `expect_skill`); tes strict: 0 mismatch + semua skill baru ter-route. Tes 52 → 54.
- Docs: sektor finance belum punya skill (tanpa sumber).

## 0.1.3 — 2026-10-31
### Diperbaiki (BUG: tidak ada skill/MCP yang dimuat OpenCode)
- 611 folder skill (aktif + pack) diganti nama = frontmatter `name`, valid regex OpenCode; bentrok diberi sufiks unik; frontmatter dinormalisasi (YAML valid, deskripsi 1–1024). Provenance di registry (`original_id`, `original_name`, `src`, `sha`), katalog, NOTICE, `metadata` frontmatter.
- `opencode.jsonc` mengikuti skema resmi: `mcp.<nama>.{type:"local", command:[...]}`; hapus `mcp.timeout`/`mcp.servers`; hapus `plugin: file://folder`; tambah `instructions` (rules 00–05), `default_agent: orchestrator`, `provider.9router.models`, izin bash deny `git push*main*`.
- Plugin dipindah ke `.opencode/plugins/swanwright.ts` (format resmi `export const X: Plugin = async () => hooks`, hook `tool.execute.before`), hanya import tipe `@opencode-ai/plugin`.
- Orchestrator: `permissions` (tak dikenal) → `permission`. Hapus folder sampah `.opencode/agents/{sectors}`.
### Ditambahkan
- `scripts/check-opencode.mjs` + validate: FAIL bila folder≠name, regex/panjang tidak valid, YAML frontmatter rusak, nama duplikat, config gagal skema https://opencode.ai/config.json (ajv 8.20.0, snapshot skema di `scripts/schema/`), agent/plugin tidak valid.
- `scripts/enable-pack.mjs`: salin pack ke `.opencode/skills` + validasi; `--disable` untuk mencabut.
- Verifikasi E2E nyata dengan OpenCode 1.19.5: `docs/VERIFY-OPENCODE.md` (48 skill, context7 connected, plugin dimuat, agent tampil).
- Tes 42 → 52. devDependencies: ajv 8.20.0, yaml 2.9.1. `@opencode-ai/plugin` 1.19.5 sengaja TIDAK dipasang: hanya import tipe (dihapus saat strip-types), dan dependensi transitifnya (toml 4.3.0 via effect, zod 4.1.8) kena CVE HIGH ber-fix per osv-scanner 2026-10-31.

## 0.1.2 — 2026-10-30
### Diperbaiki
- Layer0: 8 mismatch golden (riset-02/04/07/09/12/14/17/19) → 0. Penyebab: regex penulisan `\bpaper\b` terlalu luas sehingga "cari sumber paper"/"rangkum paper" masuk penulisan. Tambah rule riset (cari/rangkum/ringkas/survei/telaah/bandingkan + ≤3 kata + paper/jurnal/literatur) sebelum rule penulisan. Ekspektasi golden tidak diubah (sudah benar: mencari/merangkum paper = riset).
### Ditambahkan
- Tes strict: golden layer0 harus 0 mismatch; tes "tulis paper" tetap penulisan, "rangkum paper" → riset. Total 42 tes.

## 0.1.1 — 2026-10-30
### Ditambahkan
- Rule sektor coding `.opencode/rules/06-coding-karpathy.md` (≤150 token): kode minimal, perubahan bedah, asumsi headless sebagai `JUDGMENT:`, verifikasi via done-gate. Sumber multica-ai/andrej-karpathy-skills @2c606141936f1eeef17fa3043a72095b4765b9c2 (MIT).
- `harness/scan-gate.ts` + `npm run scan`: osv-scanner v2.7.0 (lockfile/manifest) dan gitleaks v8.30.1 (diff+staging). FAIL untuk CVE CRITICAL/HIGH ber-fix atau secret; MEDIUM ke bawah WARN; biner hilang UNRUN + instruksi instalasi.
- Done-gate: `sector`, `scanGate`, `changedFiles`, `taskScope`; diff-scope di luar scope → WARN (bukan blok); `warnings[]` di hasil.
- Allowlist `osv-scanner.toml` dan `.gitleaks.toml` (wajib reason/description, dicek validate). `docs/SCAN-GATE.md`.
- Layer0: kata kunci Karpathy → sektor coding + rule 06. 4 golden case baru (134 total).
- Tes: 7 → 40 (rule coding, scan PASS/FAIL/UNRUN/WARN via mock+fixture, diff-scope WARN, golden tanpa regresi, doc-code drift).
- Rule global Doc-Code Drift `.opencode/rules/00-doc-code-drift.md` (kalimat verbatim dari arXiv:2610.30571): prioritas user > kode/tes > dokumen; rule keamanan tak bisa ditimpa; drift dilaporkan sebagai FACT di bagian "Doc-Code Drift"; dimuat orchestrator + sektor coding/security (finance/media bila menyentuh kode). Catatan "bisa basi" di AGENTS.md dan rules/01.
- `harness/doc-drift.ts`: deteksi drift deterministik (print/logging, os.path/pathlib, dst.) dengan file:baris; WARN bila kode lulus tes ditulis ulang demi dokumen. `docs/DOC-CODE-DRIFT.md`.
### Diubah
- `karpathy-guidelines` → pack `coding-extra` (champion false, tetap di-vendor, atribusi tetap).
- 35 skill aktif → pack (duplikat impeccable/ui-ux-pro-max, skill jarang). Aktif 83 → 48.
- Deskripsi indeks dipersingkat (Bahasa Indonesia). Indeks aktif ~2.847 → ~1.054 token.
- osv-scanner: hasil di `packs/` dan `.opencode/skills/` (skill vendored) dilewati; `.gitleaks.toml` mengecualikan `packs/red-team/` (payload contoh vendored) dengan alasan.
- Validate: cek path skill pack, indeks vs registry, token rule 06, allowlist beralasan.

## 0.1.0
- Rilis awal.
