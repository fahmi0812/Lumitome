---
name: platformio
description: 'Bangun, flash, dan monitor firmware PlatformIO/Arduino/ESP32: validasi proyek, diagnosa build terstruktur, audit pin GPIO, flash + verifikasi serial. Use for PlatformIO, ESP32, Arduino, firmware, flash firmware, serial monitor, build firmware, diagnosa build gagal, audit pin GPIO.'
license: MIT
metadata:
  swanwright_sector: coding
  swanwright_src: fahmi0812/Lumitome
  swanwright_original_id: lumitome__platformio
  swanwright_original_name: platformio
  swanwright_sha: ee5a0758d814e0775aac22a8b2f7dbc999a98536
---

# PlatformIO: firmware ESP32/Arduino dari Lumitome

> Terdaftar di Lumitome v0.3.77 (MCP opt-in sektor coding, mati default).
> Prasyarat: PlatformIO Core terpasang (`pio` di PATH) + `platformio-mcp@3.1.0`.
> MCP `platformio` mati default; nyalakan dengan `LUMI_MCP=<default>,platformio`.
> Flash/monitor ke board nyata = UNVERIFIED (belum dites live di mesin Fahmi).

## Batas yang jujur — baca dulu

- **CLI dulu, MCP belakangan.** Upstream (v3.2.0-unreleased) menjadikan
  `pio-agent` CLI antarmuka utama; MCP Tier 2. Done-gate membaca exit code
  + `--json` CLI, bukan klaim model.
- **Flash butuh board fisik + approval.** Tanpa board, yang bisa dibuktikan
  hanya validate + build. Flash/monitor/verify tanpa board = jangan klaim.
- **Tier standard/trusted, bukan strict.** bwrap di strict memblokir akses
  serial. Kerja firmware di mesin yang board-nya tersambung.
- **Tanpa sudo.** Izin serial via grup `dialout` (oleh user). Guard menolak
  sudo di semua tier.
- **Profil policy default = `flash_requires_approval`.** Jangan pernah pakai
  profil `standalone` — itu mematikan workspace boundary, device lock,
  redaksi secret, dan audit.
- **Dashboard (`pio-agent dashboard --serve`) bukan default.** Server HTTP
  long-lived hanya bila Fahmi minta eksplisit.
- **Jangan tebak target.** Port/board/env ambigu → pakai
  `agent_resolve_target`, kembalikan ambiguitas ke Fahmi. Satu binding
  untuk satu alur tulis.

## Alur kerja

1. **Resolve target** — `agent_resolve_target` (satu env + board + device).
   Ambigu → berhenti, tanya Fahmi.
2. **Validate** — `agent_validate_project` / `pio-agent agent-validate
   --project-dir <dir>`. Perbaiki celah config sebelum build.
3. **Build** — `pio-agent build --project-dir <dir> --json`. Harus exit 0.
   Gagal → `agent_build_diagnose` (taksonomi error + RAM/Flash), perbaiki
   akar masalah, build ulang.
4. **Audit pin (ESP32)** — `agent_safe_pin_audit --board <board>` sebelum
   flash pertama / sesudah ganti pin. Perhatikan strapping, input-only,
   dan flash pins.
5. **Flash + verifikasi** — hanya setelah approval Fahmi:
   `agent_flash_monitor_verify` dengan `expect` (mis. `BOOT_OK`) dan
   `reject-patterns` (`Guru Meditation,Brownout detector,WDT reset`) +
   budget waktu terbatas (`maxRunDurationSeconds`). Atau CLI:
   `pio-agent agent-flash-monitor-verify --project-dir <dir> --expect-all
   BOOT_OK --reject-patterns "Guru Meditation,Brownout detector,WDT reset"
   --timeout 45`.
6. **Laporan** — `agent_get_last_report` buat bukti; simpan hasilnya
   (exit code, JSON build, potongan log serial) sebagai FACT.

## Perintah CLI yang umum

```bash
pio-agent devices                                  # board tersambung
pio-agent boards --filter esp32                    # cari board
npx platformio-mcp init --board esp32dev --framework arduino --project-dir ./firmware
npx platformio-mcp build --project-dir ./firmware --json
npx platformio-mcp flash --project-dir ./firmware --port auto
npx platformio-mcp monitor --project-dir ./firmware --port auto --expect BOOT_OK --timeout 30
npx platformio-mcp policy-status --project-dir ./firmware
npx platformio-mcp task-status <task-id>
```

## Done-gate (bukti, bukan klaim)

- Build: exit 0 + JSON terbaca + pemakaian RAM/Flash tercatat.
- Flash-verify: pola `expect` muncul, pola `reject` tidak muncul, dalam
  budget waktu.
- Gagal verifikasi = gagal. Jangan klaim "hampir jalan".

## Larangan

- Jangan flash / `upload_firmware` / `upload_filesystem` tanpa approval
  (tool `ask` + policy approval).
- Jangan `erase_flash`, jangan `reset_server_state` tanpa approval.
- Jangan daftarkan / tawarkan profil `standalone` atau `lab_admin`
  sebagai jalan pintas.
- Jangan salin 9 skill upstream (`pio-manager`, `firmware-bringup`, dsb.)
  ke korpus Lumitome — skill ini perujuk pola, bukan duplikatnya.
- Jangan klaim hasil flash/monitor dari VM tanpa board — itu UNVERIFIED.
