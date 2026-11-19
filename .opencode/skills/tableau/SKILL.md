---
name: tableau
description: 'Analisis data Tableau Cloud/Server: cari workbook/view, baca metadata datasource, query data, ambil data & gambar view, baca Pulse metrics. Use for Tableau, workbook, view, datasource, query data, Pulse metrics, dashboard Tableau.'
license: MIT
metadata:
  swanwright_sector: riset
  swanwright_src: fahmi0812/Lumitome
  swanwright_original_id: lumitome__tableau
  swanwright_original_name: tableau
  swanwright_sha: 1165867741687d95377126781fca5617ec7a37ed
---

# Tableau: analisis dashboard & data Tableau Cloud/Server dari Lumitome

> Terdaftar sebagai MCP opt-in sektor riset (mati default) — belum rilis
> (branch `feat/tableau-mcp`).
> Prasyarat: akun Tableau Cloud/Server + PAT (`TABLEAU_SERVER`,
> `TABLEAU_SITE_NAME`, `TABLEAU_PAT_NAME`, `TABLEAU_PAT_VALUE` di env).
> MCP `tableau` mati default; nyalakan dengan `LUMI_MCP=<default>,tableau`.
> Tes baca live = UNVERIFIED (butuh PAT + site dari Fahmi).

## Batas yang jujur — baca dulu

- **Web-only.** Paket npm `@tableau/mcp-server` tidak berisi Desktop
  authoring server. Authoring Desktop (Tableau Studio / Tableau
  Desktop + External Client API) = OUT, tugas terpisah.
- **Konten harus sudah ter-publish** di Tableau Cloud / Tableau Server
  yang bisa dijangkau server ini. File lokal `.twb` / `.twbx` yang
  belum di-publish **tidak bisa** dibuka lewat Web MCP.
- **Butuh PAT + permission "API access".** Tanpa itu, `401` (URL/site
  salah, `PAT_NAME` diisi username/email bukan nama PAT, atau PAT
  kedaluwarsa) atau `403` (belum ada permission "API access" di
  datasource itu) — minta admin/project owner.
- **PAT kedaluwarsa setelah 15 hari tidak dipakai.** Kalau auth gagal
  mendadak, buat PAT baru — jangan utak-atik config.
- **Tool tulis = ask (approval dulu).** Publish, delete, move,
  run-flow, revoke token, dan scaffold tidak jalan tanpa approval Fahmi.
- **Jangan klaim hasil tanpa bukti query.** Setiap jawaban menyebut
  nama datasource, jumlah baris yang kembali, dan filter yang dipakai.
- **Nama tool ternormalisasi** = `tableau_<nama-asli>` — strip `-`
  dipertahankan (terbukti dari kode engine OpenCode 2.3.0:
  `normalizedName` hanya mengganti karakter di luar `[a-zA-Z0-9_-]`).
  Jadi `tableau_query-datasource`, bukan `tableau_query_datasource`.

## Alur kerja

1. **Temukan konten** — `tableau_search-content` (kata kunci) atau
   `tableau_list-workbooks` + `tableau_list-views`. Ambigu (dua workbook
   mirip) → berhenti, tanya Fahmi.
2. **Baca metadata dulu** — `tableau_get-datasource-metadata` sebelum
   query apa pun (cek nama field + tipe datanya).
3. **Query dengan filter eksplisit** — `tableau_query-datasource`
   dengan filter (mis. tahun, region, kategori). Jangan tarik semua
   baris tanpa filter; sebut jumlah baris yang kembali.
4. **Bukti visual** — `tableau_get-view-data` buat angka + 
   `tableau_get-view-image` buat gambar view yang sama, supaya klaim
   bisa dicek.
5. **Pulse hanya bila ada** — `tableau_list-all-pulse-metric-definitions`
   → `tableau_generate-pulse-metric-value-insight-bundle`. Kalau tidak
   ada definisi Pulse, jangan dipaksakan.

## Contoh perintah yang benar

```text
# Top-5 state by sales di datasource Superstore
tableau_query-datasource: datasource "Superstore", fields [State, Sales],
  agregasi SUM(Sales) per State, urut menurun, limit 5

# Workbook paling banyak dilihat
tableau_list-workbooks lalu urutkan dari metadata (views / updated)
— sebut nama workbook + jumlah view yang terbaca

# Ambil gambar view untuk bukti
tableau_get-view-image: view "Disneyland Review Sentiment by Country",
  simpan hasilnya sebagai bukti visual jawaban
```

## Larangan

- Jangan publish / delete / move / run-flow tanpa approval Fahmi
  (tool `ask` + policy approval).
- Jangan `tableau_revoke-access-token` / `tableau_reset-consent`
  kecuali diminta eksplisit.
- Jangan menebak nama site / URL server; site atau workbook ambigu →
  tanya Fahmi, jangan tebak.
- Jangan klaim hasil live dari VM tanpa kredensial — itu UNVERIFIED.
- Jangan daftarkan hosted `https://mcp.tableau.com` (OAuth) atau
  server komunitas Tableau Public — v1 ini hanya npx lokal resmi.
