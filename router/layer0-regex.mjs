/** Layer-0: 0-token routing via slash commands + keyword regex. */
export const SLASH = {
  "/start": { path: "fast-path", note: "bootstrap" },
  "/status": { path: "status" },
  "/resume": { path: "resume" },
  "/sync": { path: "sync" },
  "/audit": { sektor: "security", skills: ["full-audit-keamanan"] },
  "/pentest": { sektor: "security", requiresConsent: true },
  "/verify-push": { path: "verify-push" },
  "/correct": { path: "correct" },
  "/poteto-mode": { skills: ["poteto-mode"] },
  "/in-your-own-words": { skills: ["in-your-own-words"] },
  "/docs-pack": { sektor: "penulisan", skills: ["docs-pack"] },
  "/stitch-ui": { sektor: "coding", skills: ["stitch-ui"] },
};

export const KEYWORD_RULES = [
  { re: /\b(tdd|unit test|failing test)\b/i, sektor: "coding", skillsHint: ["tdd", "test-driven"] },
  { re: /\b(karpathy|surgical change|perubahan bedah|kode minimal|overengineer\w*)\b/i, sektor: "coding", skillsHint: ["karpathy"], rules: ["06-coding-karpathy"] },
  // v0.3.17 — skill lokal baru (spesifik dulu, sebelum rule umum; "buat PRD" TIDAK masuk sini: golden coding-05/10/15/20 mengharap sektor coding)
  { re: /\b(docs?[- ]?pack|init docs|dokumentasi proyek|paket dokumen|product requirements document)\b/i, sektor: "penulisan", skillsHint: ["docs-pack"] },
  { re: /\b(stitch|design\.md|prompt ui|ui dari gambar|desain dari (gambar|screenshot))\b/i, sektor: "coding", skillsHint: ["stitch-ui", "design-taste-frontend", "impeccable"] },
  // v0.1.4 — skill yang diaktifkan kembali (spesifik dulu, sebelum rule umum)
  { re: /\b(sound design|sfx|cue sheet)\b/i, sektor: "media", skillsHint: ["sound-design"] },
  { re: /\b(video demo|demo video|rekam demo)\b/i, sektor: "media", skillsHint: ["video-demo"] },
  { re: /\b(web ?sims?|video simulasi|simulasi partikel)\b/i, sektor: "media", skillsHint: ["web-sims"] },
  { re: /\b(contact sheet|review (motion|animasi))\b/i, sektor: "media", skillsHint: ["review-loop", "motion-design"] },
  { re: /\b(laporan (pkl|magang|praktikum|kerja praktek)|makalah)\b/i, sektor: "penulisan", skillsHint: ["laporan-generator"] },
  { re: /\b(komunikasi internal|newsletter internal|status update tim|pengumuman internal)\b/i, sektor: "penulisan", skillsHint: ["internal-comms"] },
  { re: /\b(dokumentasi (sdk|api|library|developer)|getting started docs|technical writ\w*)\b/i, sektor: "penulisan", skillsHint: ["technical-writer"] },
  { re: /\b(proposal|decision doc|spec teknis|rfc dokumen|ko-?penulisan)\b/i, sektor: "penulisan", skillsHint: ["doc-coauthoring"] },
  { re: /\b(interrogate|adversarial review|blind spots?|stress test (kode|code|rencana|ide))\b/i, sektor: "riset", skillsHint: ["interrogate"] },
  { re: /\b(figure it out|playbook (migrasi|perubahan)|migrasi besar)\b/i, sektor: "riset", skillsHint: ["figure-it-out"] },
  { re: /\b(riset|research|sumber primer)\b(?!.*\b(tulis|naskah)\b)/i, sektor: "riset", skillsHint: ["research", "deep-research"] },
  { re: /\b(code audit|audit kode|sast|semgrep|codeql)\b/i, sektor: "security", skillsHint: ["code-audit"] },
  { re: /\b(code review|review (kode|pr)|minta review|feedback review)\b/i, sektor: "coding", skillsHint: ["code-review", "requesting-code-review", "receiving-code-review"] },
  { re: /\b(gsap|scrolltrigger|animasi scroll)\b/i, sektor: "media", /* golden media-05 dkk: animasi = executor media; skill gsap-* tetap terdaftar coding (design UI) */ skillsHint: ["gsap-core", "gsap-scrolltrigger"] },
  { re: /\b(magic ?ui|hallmark|anti-?slop|ui polish)\b/i, sektor: "coding", skillsHint: ["magic-ui", "hallmark", "design-taste-frontend", "emil-design-eng"] },
  { re: /\b(brainstorm\w*|paralel agen|parallel agents|selesaikan branch|git guardrails?|buat skill|skill creator|json-render)\b/i, sektor: "coding", skillsHint: ["brainstorming", "dispatching-parallel-agents", "finishing-a-development-branch", "git-guardrails-claude-code", "skill-creator", "react", "next"] },
  { re: /^(?![\s\S]*\b(audit|keamanan|security|pentest)\b)[\s\S]*\b(debug\w*|akar masalah|root ?cause|error \d{3}|stack ?trace|bug)\b/i, sektor: "coding", skillsHint: ["systematic-debugging", "root-cause-gate", "tdd-red-green-refactor"] },
  // v0.2 (lumi/fix-v2): backend/API & keuangan — sebelumnya jatuh ke retrieval leksikal dan meleset
  { re: /^(?![\s\S]*\b(audit|keamanan|security|pentest|sast)\b)[\s\S]*\b(rest ?api|api rest|endpoint|crud|backend|express(\.js)?|fastify|nestjs|graphql|grpc|microservice\w*|kontrak (api|layanan)|openapi)\b/i, sektor: "coding", skillsHint: ["typed-service-contracts", "tdd-red-green-refactor", "mongodb-ops", "supabase-ops", "systematic-debugging"] },
  { re: /\b(keuangan|finansial|financial|akuntansi|neraca|laba rugi|arus kas|cash ?flow|rasio (likuiditas|solvabilitas|profitabilitas)|valuasi|saham|portofolio investasi)\b/i, sektor: "finance" },
  { re: /\b(pentest|red team|exploit)\b/i, sektor: "security", requiresConsent: true },
  { re: /\b(backtest|trading|ccxt|freqtrade)\b/i, sektor: "finance" },
  { re: /\b(short[s]? video|remotion|motion design)\b/i, sektor: "media", skillsHint: ["motion-design"] },
  // Membaca/mencari/merangkum paper = riset; menulis paper = penulisan (harus sebelum rule penulisan).
  { re: /\b(cari|carikan|rangkum|ringkas|survei|telaah|bandingkan)\b(\s+\S+){0,3}\s+(paper|jurnal|literatur)\b/i, sektor: "riset" },
  { re: /\b(paper|naskah|eyd|skripsi|tesis)\b/i, sektor: "penulisan" },
  { re: /\b(osint|geolocat|crawl4ai|deep research)\b/i, sektor: "riset" },
  { re: /\b(apk|ghidra|reverse engineer|decompile)\b/i, sektor: "security" },
];

export function layer0(prompt) {
  const p = String(prompt || "").trim();
  const slash = p.split(/\s+/)[0];
  if (SLASH[slash]) return { hit: true, layer: 0, ...SLASH[slash], raw: slash };
  for (const r of KEYWORD_RULES) {
    if (r.re.test(p)) return { hit: true, layer: 0, sektor: r.sektor, skillsHint: r.skillsHint || [], rules: r.rules || [], requiresConsent: !!r.requiresConsent };
  }
  return { hit: false, layer: 0 };
}
