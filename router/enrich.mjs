/**
 * Generator pengayaan skill (dipanggil otomatis oleh buildIndex; dump manual: `node scripts/skill-enrich.mjs`).
 * Sumber: (1) kurasi manual router/skills-aliases.json {id[], en[]}; (2) otomatis: nama skill, akronim, kamus
 * sinonim dwibahasa ID↔EN di bawah; (3) contoh kalimat permintaan dari template ID/EN × alias (3–5 per skill).
 * Deterministik (tanpa jaringan, tanpa LLM) → hash indeks stabil.
 */
import fs from "node:fs";
import path from "node:path";

// kamus sinonim dwibahasa (kata → padanan); diterapkan ke token alias/deskripsi
export const SYN = {
  laporan: ["report"], report: ["laporan"], kode: ["code"], code: ["kode"], tes: ["test", "uji"], test: ["tes", "uji"], uji: ["test", "tes"],
  keamanan: ["security"], security: ["keamanan"], dependensi: ["dependency"], dependency: ["dependensi"], celah: ["vulnerability", "kerentanan"], dokumen: ["document", "doc"], document: ["dokumen"], dokumentasi: ["documentation", "docs"],
  documentation: ["dokumentasi"], desain: ["design"], design: ["desain"], arsitektur: ["architecture"], architecture: ["arsitektur"], arsitek: ["architect"], architect: ["arsitek"], riset: ["research"], research: ["riset", "penelitian"],
  keuangan: ["finance", "financial"], finance: ["keuangan"], pajak: ["tax"], tax: ["pajak"], anggaran: ["budget"], budget: ["anggaran"],
  utang: ["debt", "hutang"], debt: ["utang"], tabungan: ["savings"], pembukuan: ["bookkeeping"], neraca: ["balance sheet"],
  rasio: ["ratio"], ratio: ["rasio"], animasi: ["animation"], animation: ["animasi"], video: ["video"], suara: ["sound", "audio"],
  sound: ["suara"], presentasi: ["presentation", "slides"], presentation: ["presentasi"], diagram: ["diagram", "bagan"],
  galat: ["error", "bug"], error: ["galat", "kesalahan"], bug: ["galat", "kutu"], perbaiki: ["fix"], fix: ["perbaiki"],
  geolokasi: ["geolocate", "geolocation"], geolocate: ["geolokasi"], geolocation: ["geolokasi"], foto: ["photo"], photo: ["foto"],
  diagnosa: ["diagnosis"], diagnosis: ["diagnosa"],
  tulis: ["write"], write: ["tulis"], buat: ["create", "build"], create: ["buat"], tinjau: ["review"], review: ["tinjau", "ulas"],
  kerentanan: ["vulnerability"], vulnerability: ["kerentanan", "celah"], halaman: ["page"], page: ["halaman"], komponen: ["component"],
  component: ["komponen"], rencana: ["plan"], plan: ["rencana"], basis: ["database"], database: ["basis data", "db"],
  rilis: ["release", "deploy"], deploy: ["deploi", "rilis"], cari: ["search", "find"], akar: ["root"], masalah: ["problem", "issue"],
};
const TPL_ID = ["tolong bantu {a}", "saya perlu {a} untuk proyek ini", "bagaimana cara {a}?", "kerjakan {a} sekarang"];
const TPL_EN = ["help me with {a}", "I need {a} for this project", "how do I do {a}?"];

const words = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

export function loadCurated(root = ".") {
  const p = path.join(root, "router/skills-aliases.json");
  try { const j = JSON.parse(fs.readFileSync(p, "utf8")); delete j._doc; return j; } catch { return {}; }
}

/** skill {name, short, description} → {aliases_id, aliases_en, synonyms, examples} */
export function enrichSkill(s, curated = {}) {
  const c = curated[s.name] || {};
  const nameAlias = s.name.replace(/-/g, " ");
  const acro = s.name.includes("-") ? s.name.split("-").map((w) => w[0]).join("") : "";
  const aliases_id = [...new Set([...(c.id || [])])];
  const aliases_en = [...new Set([...(c.en || []), nameAlias, ...(acro.length >= 3 ? [acro] : [])])];
  const base = new Set([...words(s.short), ...aliases_id.flatMap(words), ...aliases_en.flatMap(words)]);
  const synonyms = [...new Set([...base].flatMap((w) => SYN[w] || []))].filter((w) => !base.has(w));
  const pickA = (arr, i) => arr.length ? arr[i % arr.length] : nameAlias;
  const examples = [
    TPL_ID[0].replace("{a}", pickA(aliases_id, 0)),
    TPL_ID[1].replace("{a}", pickA(aliases_id, 1)),
    TPL_EN[0].replace("{a}", pickA(aliases_en, 0)),
    TPL_EN[1].replace("{a}", pickA(aliases_en, 1)),
  ];
  if (s.short) examples.push(String(s.short).split(/[:—]/).pop().trim());
  return { aliases_id, aliases_en, synonyms, examples: [...new Set(examples)].slice(0, 5) };
}
