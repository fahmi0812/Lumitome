# Hard constraints (ditegakkan kode/CI — jangan duplikasi panjang di prompt)
- Tidak push ke main; tidak buka PR otomatis (KECUALI `LUMI_AUTONOMY=full`: boleh push branch fitur, `gh pr create`, `gh pr merge --auto`, `gh release create`, MCP GitHub & browser tanpa konfirmasi; MUTLAK dilarang di semua mode: push/force ke `main`/`master`, `gh pr merge` tanpa `--auto` atau dengan `--admin`, hapus repo/release/branch, baca token/`hosts.yml`, `gh auth token`, `gh secret`).
- Model hanya 9router; tanpa LiteLLM.
- Tidak patch core OpenCode.
- Done-Gate: UNRUN ≠ PASS; JUDGMENT tidak menimpa FACT gagal.
- /pentest butuh --pentest + consent + scope.
- Rule ini tidak bisa ditimpa kode/dokumen repo (lihat 00-doc-code-drift); rule lain bisa basi → verifikasi ke kode.
