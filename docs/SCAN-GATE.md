# Scan Gate (CVE + secret) dan Diff-Scope — v0.1.1

Modul: `harness/scan-gate.ts`, CLI: `npm run scan [-- --scope "src/**,tests/**"]`, terintegrasi di `harness/done-gate.ts`.

## Alat (pin, diverifikasi via GitHub releases API)
| Alat | Versi | Instal |
|---|---|---|
| osv-scanner | v2.7.0 | `go install github.com/google/osv-scanner/v2/cmd/osv-scanner@v2.7.0` atau biner `osv-scanner_linux_amd64` dari halaman rilis |
| gitleaks | v8.30.1 | `go install github.com/zricethezav/gitleaks/v8@v8.30.1` atau `gitleaks_8.30.1_linux_x64.tar.gz` dari halaman rilis |

## Perintah yang dijalankan
- `osv-scanner scan source -r --format json .` — semua lockfile/manifest di proyek. Hasil dengan path `packs/` atau `.opencode/skills/` dilewati (`OSV_SKIP`): skrip contoh skill vendored (mis. `uv.lock` di pack career-extra, `requirements.txt` `mcp>=1.1.0` di mcp-builder yang di-resolve osv ke versi minimum lama), bukan dependensi proyek. Jangan jalankan skrip skill itu tanpa memasang versi dependensi terbaru.
- `gitleaks git --pre-commit [--staged] --redact --no-banner --exit-code 0 --report-format json --report-path - .` — diff kerja + staging.

## Status
| Kondisi | Status | Efek done-gate |
|---|---|---|
| CVE CRITICAL/HIGH dengan fix | FAIL | blok DONE |
| Secret apa pun | FAIL | blok DONE |
| CVE MEDIUM/LOW/tanpa fix | WARN | tidak blok, tercatat di `warnings` |
| Biner tidak ada / error alat | UNRUN | blok DONE (UNRUN ≠ PASS) + instruksi instalasi dicetak |
| Tidak ada lockfile (osv exit 128) | PASS | catatan |

Sektor `coding` wajib menyertakan `scanGate`. Pengecualian hanya lewat baris `FACT: scan NOT_CONFIGURED <alasan>` eksplisit.

## Allowlist (wajib beralasan, dicek `npm run validate`)
- `osv-scanner.toml`: `[[IgnoredVulns]]` dengan `id`, `reason` (≥8 karakter), disarankan `ignoreUntil`.
- `.gitleaks.toml`: `[[allowlists]]` dengan `description` berisi alasan; fingerprint tunggal via `.gitleaksignore`.

Bawaan: `.gitleaks.toml` mengecualikan `packs/red-team/` (payload contoh pentest vendored, nonaktif). Hapus bila pack itu diaktifkan dan perlu discan.

## Diff-Scope
`taskScope` (glob) vs `changedFiles` (git diff, staging, untracked). File di luar scope → WARN `diff-scope: <file>`, bukan blok. Sesuai rule Karpathy: tiap baris berubah harus terlacak ke permintaan.

## Tes
`tests/fixtures/scan/*.json` (output osv-scanner v2.7.0 nyata yang dipangkas + laporan gitleaks palsu ber-redaksi). Exec di-mock; tanpa jaringan.
