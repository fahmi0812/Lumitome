#!/usr/bin/env node
/** Dump hasil pengayaan skill aktif (untuk review/kurasi). Pakai: node scripts/skill-enrich.mjs [nama-skill] */
import { collectSkills } from "../router/skill-db.mjs";
import { enrichSkill, loadCurated } from "../router/enrich.mjs";
const cur = loadCurated(".");
const only = process.argv[2];
const out = {};
for (const s of collectSkills(".").filter((x) => x.status === "active" && (!only || x.name === only))) out[s.name] = enrichSkill(s, cur);
console.log(JSON.stringify(out, null, 2));
