/**
 * Adapter tipis untuk API experimental.* OpenCode 2.4.2 (M1 / T2.1).
 * Menjamin kompatibilitas dengan engine 2.3.0 (hook tidak tersedia) dan
 * isolasi kegagalan agar boot plugin tidak pernah jatuh.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function defaultLumiHome(env = process.env) {
  return env?.LUMI_HOME || path.join(env?.HOME || os.homedir(), ".lumitome");
}

export function telemetryPath(home = defaultLumiHome()) {
  return path.join(home, "telemetry", "idle-redrive.jsonl");
}

export function appendIdleTelemetry(home, entry) {
  try {
    const file = telemetryPath(home);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify({ t: new Date().toISOString(), ...entry }) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

export function hasExperimentalHookSupport(ctx) {
  return typeof ctx?.session?.hook === "function";
}

export function hasSyntheticSupport(ctx) {
  return typeof ctx?.session?.synthetic === "function";
}

export function hasExperimentalIdleCapability(ctx) {
  return hasExperimentalHookSupport(ctx) && hasSyntheticSupport(ctx);
}

/**
 * Daftarkan hook experimental.* secara aman (fail-silent + telemetri capability-missing).
 */
export async function registerExperimentalHook(
  ctx,
  hookName,
  handler,
  { home = defaultLumiHome(), fallback = "passive-audit+wrapper-done-gate" } = {},
) {
  if (!hasExperimentalHookSupport(ctx)) {
    appendIdleTelemetry(home, { kind: "capability-missing", hook: hookName, fallback, reason: "session.hook missing" });
    return { registered: false, reason: "hook-api-missing" };
  }
  try {
    const registration = await ctx.session.hook(hookName, handler);
    return { registered: true, registration };
  } catch (e) {
    appendIdleTelemetry(home, {
      kind: "capability-missing",
      hook: hookName,
      fallback,
      error: String(e?.message ?? e),
    });
    return { registered: false, reason: "hook-rejected", error: String(e?.message ?? e) };
  }
}

/**
 * Panggil ctx.session.synthetic secara idempoten.
 * Bila engine menolak format `id` custom (bukan 409 conflict), fallback tanpa `id`
 * dengan perlindungan Set idempotency in-memory sebagai lapis kedua.
 */
export async function sendSyntheticIdempotent(ctx, params, { idempotencySet } = {}) {
  if (!hasSyntheticSupport(ctx)) {
    return { ok: false, reason: "synthetic-api-missing" };
  }
  const id = params?.id;
  if (idempotencySet && id && idempotencySet.has(id)) {
    return { ok: false, deduplicated: true, id };
  }
  try {
    const res = await ctx.session.synthetic(params);
    if (idempotencySet && id) idempotencySet.add(id);
    return { ok: true, id, result: res };
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (id && !/409|conflict/i.test(msg) && /id|schema|invalid|prefix/i.test(msg)) {
      const { id: _drop, ...withoutId } = params;
      const res = await ctx.session.synthetic(withoutId);
      if (idempotencySet) idempotencySet.add(id);
      return { ok: true, id: null, fallbackNoId: true, result: res };
    }
    throw e;
  }
}
