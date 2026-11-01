# Lumitome

CLI AI coding yang **aman secara default**, di atas engine **OpenCode v2.2.4 (terpin)** + harness Swanwright, dengan provider **9router**.

```bash
curl -fsSL https://raw.githubusercontent.com/fahmi0812/Lumitome/main/install.sh | bash
export NINEROUTER_API_KEY=…                # tidak pernah dicetak / ditulis
export LUMI_9ROUTER_URL=http://127.0.0.1:20128/v1   # atau URL 9router Anda
lumitome run "perbaiki tes yang gagal"      # headless
lumitome                                    # TUI
```

## Kenapa Lumitome

- **Terisolasi dari OpenCode Anda.** Engine terpin + SHA256 di `~/.lumitome/bin/opencode`, tidak masuk PATH global. Config, data, sesi, dan `auth.json` OpenCode Anda (`~/.config/opencode`, `~/.local/share/opencode`) tidak dibaca dan tidak ditulis. Satu-satunya file di luar `~/.lumitome` adalah launcher `~/.local/bin/lumitome`.
- **Tanpa auto-update.** `OPENCODE_DISABLE_AUTOUPDATE=1` + `update:"disable"`, tanpa fetch models.dev. Engine hanya diganti lewat `lumitome upgrade-engine <versi> --sha256 <hash>` (dengan konfirmasi). Update `opencode` global tidak memengaruhi Lumitome.
- **Repo asing tidak dipercaya.** Config/plugin/agent/MCP proyek tidak dimuat kecuali `LUMI_TRUST_PROJECT=1`.
- **Guard + sandbox.**
  - Isi `.env`/secret ditolak (daftar nama boleh).
  - `rm -rf` di luar workspace ditolak.
  - Push force atau ke main ditolak; push branch lain meminta izin di TUI/serve.
  - Shell berjalan di `bwrap` (FS read-only kecuali workspace, env dibersihkan).
- **Selesai = terbukti.**
  - Done-gate membaca exit code tes terakhir (termasuk `|| true`, `; cmd`, `| pipe` yang menyamarkan kegagalan).
  - Anti-spin per aksi.
  - Run berhenti dengan exit 124 saat provider diam (≤90 s) atau deadline 5 menit.
- **Skill terarah.** 86 skill aktif (coding, riset, penulisan, media, security, finance dasar). Router memilih ≤3 per tugas. Tidak ada skill atau MCP trading.

Detail CLI, env, exit code: [`lumitome/README.md`](lumitome/README.md). Arsitektur harness: [`docs/harness/SWANWRIGHT-README.md`](docs/harness/SWANWRIGHT-README.md).

## Uninstall

```bash
bash ~/.lumitome/src/install.sh --uninstall   # hapus ~/.lumitome + launcher saja; OpenCode Anda utuh
```

## Lisensi

MIT — lihat [`LICENSE`](LICENSE). Basis: [fahmi0812/Swanwright](https://github.com/fahmi0812/Swanwright) (MIT). Engine: [OpenCode](https://github.com/anomalyco/opencode) (MIT, diunduh saat instal, tidak di-vendor). Skill pihak ketiga: [`NOTICE.md`](NOTICE.md).
