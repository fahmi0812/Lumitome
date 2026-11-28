import os from "node:os";
import path from "node:path";

/**
 * Kompatibilitas variabel env SW_* -> LUMI_* (v0.4.0 Wave 0, T0.2).
 *
 * Aturan presedensi: LUMI_* selalu menang atas SW_*.
 * - resolveEnvFlag: memakai semantik nullish coalescing (?? / !== undefined)
 *   khusus untuk flag di mana string kosong "" bermakna disable eksplisit
 *   (contoh: LUMI_EMBED_MODEL="" -> nonaktif eksplisit, TIDAK fallback ke SW_EMBED_MODEL).
 * - resolveEnvValue: untuk kredensial & URL — skip string kosong "" ke alias
 *   berikutnya agar fallback shell/CI (mis. LUMI_KEY_9ROUTER="") tidak putus.
 * - Peringatan deprecasi dicetak sekali per nama alias SW_* per proses ke
 *   process.stderr.write (tanpa console.* agar patuh LINT-003).
 */
const _warned = new Set();

export function resetEnvCompatWarnings() {
  _warned.clear();
}

export function warnDeprecatedEnv(alias, canonical, { stderr = (m) => process.stderr.write(m), warned = _warned } = {}) {
  if (!alias || warned.has(alias)) return false;
  warned.add(alias);
  stderr(`[lumitome] DEPRECATED: ${alias} akan dihapus di v0.5.0; ganti dengan ${canonical}\n`);
  return true;
}

/**
 * Resolusi flag dengan semantik nullish (??): canonical !== undefined menang,
 * termasuk string kosong "" (disable eksplisit).
 */
export function resolveEnvFlag(env = process.env, canonical, aliases = [], opts = {}) {
  const src = env && typeof env === "object" ? env : {};
  if (src[canonical] !== undefined) return src[canonical];
  for (const alias of aliases) {
    if (src[alias] !== undefined) {
      if (alias.startsWith("SW_")) warnDeprecatedEnv(alias, canonical, opts);
      return src[alias];
    }
  }
  return opts.defaultValue;
}

/**
 * Resolusi nilai (kredensial / URL / path): canonical non-kosong menang;
 * string kosong "" di-skip ke alias berikutnya.
 */
export function resolveEnvValue(env = process.env, canonical, aliases = [], opts = {}) {
  const src = env && typeof env === "object" ? env : {};
  if (src[canonical] !== undefined && String(src[canonical]) !== "") return String(src[canonical]);
  for (const alias of aliases) {
    const v = src[alias];
    if (v !== undefined && String(v) !== "") {
      if (alias.startsWith("SW_")) warnDeprecatedEnv(alias, canonical, opts);
      return String(v);
    }
  }
  return opts.defaultValue;
}

export function resolveCompatLumiHome(env = process.env, opts = {}) {
  return resolveEnvValue(env, "LUMI_HOME", ["SW_HOME"], opts)
    || path.join((env && env.HOME) || os.homedir(), ".lumitome");
}

export function resolveCompatEmbedModel(env = process.env, opts = {}) {
  return resolveEnvFlag(env, "LUMI_EMBED_MODEL", ["SW_EMBED_MODEL"], opts);
}

export function resolveCompat9RouterUrl(env = process.env, opts = {}) {
  return resolveEnvValue(env, "LUMI_9ROUTER_URL", ["SW_9ROUTER_URL"], opts)
    || "http://127.0.0.1:20128/v1";
}

export function resolveCompat9RouterKey(env = process.env, opts = {}) {
  return resolveEnvValue(env, "LUMI_KEY_9ROUTER", ["LUMI_9ROUTER_KEY", "SW_9ROUTER_KEY", "NINEROUTER_API_KEY"], opts) || "";
}
