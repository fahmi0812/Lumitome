<p align="center">
  <img src="../../assets/brand/banner-1600x900.png" alt="Swanwright — The Elegant AI Coding Harness" width="100%"/>
</p>

<h3 align="center"><em>Anggun di permukaan. Presisi di kedalaman.</em></h3>

<p align="center">
  Harness AI coding premium untuk <b>OpenCode v2.2.4</b> — orkestrasi tipis, <b>86 skill</b>, <b>10 agen</b>, dan MCP per sektor yang aman secara default.
</p>

<p align="center">
  <a href="https://github.com/fahmi0812/Swanwright/releases/tag/v0.1.6"><img src="https://img.shields.io/badge/version-0.1.6-C9A227?style=for-the-badge&labelColor=FFFFFF" alt="version"/></a>
  <a href="https://github.com/anomalyco/opencode/releases/tag/v2.2.4"><img src="https://img.shields.io/badge/OpenCode-v2.2.4-D4AF37?style=for-the-badge&labelColor=FFFFFF" alt="opencode"/></a>
  <img src="https://img.shields.io/badge/skills-86-E8D9B0?style=for-the-badge&labelColor=FFFFFF" alt="skills"/>
  <img src="https://img.shields.io/badge/agents-10-E8D9B0?style=for-the-badge&labelColor=FFFFFF" alt="agents"/>
  <img src="https://img.shields.io/badge/tests-83%2F83-C9A227?style=for-the-badge&labelColor=FFFFFF" alt="tests"/>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0B1B33?style=for-the-badge&labelColor=FFFFFF" alt="license"/></a>
</p>

<p align="center">
  <a href="#instalasi-satu-baris"><b>Instalasi</b></a> &nbsp;·&nbsp;
  <a href="#mengapa-swanwright"><b>Mengapa Swanwright</b></a> &nbsp;·&nbsp;
  <a href="#arsitektur"><b>Arsitektur</b></a> &nbsp;·&nbsp;
  <a href="#verifikasi"><b>Verifikasi</b></a>
</p>

<br/>

<div align="center">

```bash
curl -fsSL https://raw.githubusercontent.com/fahmi0812/Swanwright/main/install.sh | bash
```

<sub>Satu baris. Idempoten. Checksum SHA256 terpin.</sub>

</div>

<br/>

---

## Mengapa Swanwright

<table>
<tr>
<td width="33%" valign="top">

### ◇ Ramping
Orchestrator tipis mendelegasikan ke sub-agen sektor. Skill dimuat **lazy** — konteks tetap bersih.

</td>
<td width="33%" valign="top">

### ◇ Tepat
Skill Query Layer: SQLite FTS5 BM25 + RRF, lalu satu panggilan 9router memilih ≤5 skill yang relevan.

</td>
<td width="33%" valign="top">

### ◇ Aman
MCP **deny-by-default** per sektor, plugin guard pemblokir push ke `main`, token hanya di `secrets.env` (`chmod 600`).

</td>
</tr>
<tr>
<td valign="top">

### ◇ Berbukti
Done-gate FACT / JUDGMENT, osv-scanner & gitleaks opsional. Selesai berarti terbukti.

</td>
<td valign="top">

### ◇ Teruji
**83/83** test lulus. `doctor` memverifikasi instalasi end-to-end hingga **0 FAIL**.

</td>
<td valign="top">

### ◇ Siap pakai
Linux · macOS · WSL2. Node, OpenCode, codebase-memory-mcp, dan uv dipasang otomatis.

</td>
</tr>
</table>

---

## Instalasi satu baris

```bash
curl -fsSL https://raw.githubusercontent.com/fahmi0812/Swanwright/main/install.sh | bash
```

Alternatif (clone penuh):

```bash
git clone https://github.com/fahmi0812/Swanwright.git && cd Swanwright && ./install.sh
```

Lalu:

```bash
source ~/.swanwright/env.sh
bash ~/.swanwright/src/install.sh --doctor   # atau: bash install.sh --doctor di dalam clone
```

Installer **idempoten**, mem-pin SHA256 + mencocokkan file checksum rilis untuk OpenCode, Node, codebase-memory-mcp, dan uv. Tidak menyentuh `~/.config/opencode`. Token hanya lewat `~/.swanwright/secrets.env` (`chmod 600`).

> **Jangan** jalankan `codebase-memory-mcp install` / `update` — binary didaftarkan manual sebagai MCP `codemem`.

---

## Fitur unggulan

| | |
|---|---|
| **Orchestrator tipis** | Primary agent → sub-agen sektor (depth=1) → Elephant / Goldfish / Synthesizer |
| **900 skill (734 ter-route)** | Lazy-load; `api-security` & `llm-security` tetap disabled |
| **Skill Query Layer** | SQLite FTS5 BM25 (+sqlite-vec opsional), filter SQL keras, RRF, 1 panggilan 9router pilih ≤5 |
| **MCP per sektor** | deny-by-default `*_*` → allow server sektor sendiri; `skills` read-only |
| **Plugin guard** | Blok push ke `main`/`master` + blok `codebase-memory-mcp install/update` |
| **Done-gate berbukti** | FACT / JUDGMENT; osv-scanner + gitleaks opsional |
| **Doctor** | `scripts/doctor.sh` — verifikasi end-to-end 0 FAIL |

---

## Arsitektur

<p align="center">
  <img src="../../assets/arsitektur.png" alt="Arsitektur Swanwright" width="860"/>
</p>

<p align="center">
  <img src="../../assets/orchestrator.png" alt="Alur orchestrator" width="860"/>
</p>

Rincian: [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`docs/ROUTING.md`](../ROUTING.md) · [`docs/MCP.md`](../MCP.md)

---

## Sektor & MCP

| Sektor | Server (selain `skills`) |
|---|---|
| **coding** | context7 · codemem · playwright · chromedev · github *(mati)* |
| **media** | playwright · chromedev · figma *(mati, OAuth)* |
| **riset** | context7 · markitdown · playwright |
| **penulisan** | context7 · markitdown |
| **security** | context7 · codemem *(defensif; tanpa trading/Kali)* |
| **finance** | markitdown *(tanpa trading MCP)* |
| elephant / goldfish | context7+codemem / codemem |
| orchestrator / synthesizer | — |

Gateway `gw-*`, figma, github: **disabled by default**. Lihat [`docs/MCP-GATEWAY.md`](../MCP-GATEWAY.md).

---

## Isi paket

```
Swanwright/
├── install.sh              # one-liner & local install (SHA256 terpin)
├── opencode.jsonc          # OpenCode v2.2.4 + MCP sektor
├── .opencode/              # agents (10) · skills (86) · plugins · rules
├── router/                 # skill-db FTS5, layer0, layer1-select, mcp-sectors
├── harness/                # done-gate, scan-gate, sandbox
├── scripts/doctor.sh       # verifikasi 0 FAIL
├── packs/                  # pack: bagian satu korpus routing (red-team disabled)
├── docs/                   # PRD, MCP, routing, catalog
└── assets/                 # logo, banner, diagram
```

---

## Verifikasi

```bash
source ~/.swanwright/env.sh
bash install.sh --doctor     # harap: doctor: 0 FAIL
npm test                     # harap: 83/83
npm run validate
npm run skills:metrics
```

**Metrik retrieval (BM25-only, golden 154, diukur 31 Okt 2026):**

| Metrik | Nilai |
|---|---|
| tests | **83 / 83** |
| top-1 | **0,78** |
| recall@5 (any) | **0,92** |
| MRR | **0,84** |
| Layer-0 mismatch | **0** |

---

## Persyaratan

| | |
|---|---|
| OS | Linux · macOS · **WSL2** (Windows native ditolak) |
| Runtime | Node ≥ 22.6 (dipasang otomatis bila perlu) · OpenCode **v2.2.4** |
| Model | **9router** di `127.0.0.1:20128` (`SW_9ROUTER_URL` / `SW_9ROUTER_KEY`) |
| Browser | Google Chrome stable untuk `chrome-devtools-mcp` |
| Opsional | `osv-scanner` v2.7.0 · `gitleaks` v8.30.1 · `sqlite3` CLI · Docker (gateway) |

Selalu `source ~/.swanwright/env.sh` sebelum menjalankan `opencode`.

---

## Lisensi

Kode Swanwright: **MIT** — lihat [`LICENSE`](../../LICENSE).  
Skill pihak ketiga: [`NOTICE.md`](../../NOTICE.md) · [`docs/SKILLS-CATALOG.md`](../SKILLS-CATALOG.md).

<p align="center">
  <img src="../../assets/brand/logo.svg" alt="swan" width="96"/>
  <br/>
  <sub>Swanwright · v0.1.6</sub>
</p>
