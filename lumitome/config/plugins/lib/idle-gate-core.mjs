/**
 * Logika murni Pre-Stop Re-Drive Gate (M1 / T2.1) — dapat diuji unit secara deterministik
 * tanpa membutuhkan proses OpenCode live.
 */
import crypto from "node:crypto";
import { appendIdleTelemetry, defaultLumiHome, sendSyntheticIdempotent } from "./experimental-adapter.mjs";

export const DEFAULT_MAX_REDRIVES = 2;

export function buildRedriveId(sessionID, turnSeq, attempt, reason) {
  const key = crypto
    .createHash("sha256")
    .update(`${sessionID}:${turnSeq}:${attempt}:${reason}`)
    .digest("hex")
    .slice(0, 24);
  return `msg_lumi_redrive_${key}`;
}

export function buildCorrectivePrompt(reason, details = {}) {
  if (reason === "DELEGATION_BYPASS") {
    return [
      "[Pre-Stop Gate — DELEGATION_BYPASS]",
      "Mode /subagent aktif, tetapi kamu mencoba berhenti atau memutasi tanpa mendelegasikan ke peran /subagent.",
      "Delegasikan pekerjaan ke peran yang sesuai (`thinking`/`search`/`builder`/`reviewer`) via tool `subagent`, atau laporkan `BLOCKED` bila mentok.",
    ].join("\n");
  }
  if (reason === "GATE_STATE_UNREADABLE") {
    return [
      "[Pre-Stop Gate — GATE_STATE_UNREADABLE]",
      "State verifikasi/witness tidak dapat dibaca (fail-closed). Jalankan perintah verifikasi konkret (`npm test` / `npm run lint` / `npm run validate`) dan pastikan hasilnya exit 0 sebelum berhenti.",
    ].join("\n");
  }
  const hints = [];
  if (details.ran === 0 && details.hasValidWitness !== true) hints.push("belum ada eksekusi tes/verifikasi di sesi ini (UNRUN)");
  if (typeof details.lastExit === "number" && details.lastExit !== 0) hints.push(`verifikasi terakhir gagal (exit=${details.lastExit})`);
  if (details.maskedExit) hints.push("exit code tersamarkan (|| true / set +e)");
  if (details.staleWitness) hints.push("witness berstatus STALE karena file berubah setelah tes");
  if ((details.bgPending ?? 0) > 0) hints.push(`masih ada ${details.bgPending} shell background belum selesai`);
  if (details.featuresAllPass === false) hints.push("features.json masih memuat item belum PASS");
  if (details.sector === "coding" && details.scanStatus !== "PASS" && details.scanStatus !== "WARN") {
    hints.push(`scan-gate berstatus ${details.scanStatus ?? "UNRUN"}`);
  }
  const detailLine = hints.length ? `Temuan: ${hints.join("; ")}.` : "Bukti verifikasi belum lengkap (UNVERIFIED_STOP).";
  return [
    "[Pre-Stop Gate — UNVERIFIED_STOP]",
    detailLine,
    "Jalankan perintah verifikasi konkret (`npm test` / `npm run lint` / `npm run validate` / `npm run scan`) sampai seluruh cek lulus (exit 0) sebelum mengakhiri sesi, atau laporkan `BLOCKED` dengan fakta objektif.",
  ].join("\n");
}

export class IdleGateController {
  constructor({
    maxRedrives = DEFAULT_MAX_REDRIVES,
    env = process.env,
    lumiHome,
    onWarning,
    onTelemetry,
  } = {}) {
    this.maxRedrives = maxRedrives;
    this.env = env;
    this.lumiHome = lumiHome || defaultLumiHome(env);
    this.onWarning = onWarning || ((msg) => process.stderr.write(msg + "\n"));
    this.onTelemetry = onTelemetry || ((entry) => appendIdleTelemetry(this.lumiHome, entry));

    this.turnSeqBySession = new Map();
    this.redrivesByTurn = new Map();
    this.idempotencySet = new Set();
    this.activeCompactions = new Set();
    this.sessionState = new Map();
  }

  activeTurnSeq(sessionID) {
    return this.turnSeqBySession.get(sessionID) ?? 0;
  }

  getState(sessionID) {
    if (!this.sessionState.has(sessionID)) {
      this.sessionState.set(sessionID, {
        wrote: false,
        waitingForUser: false,
        blocked: false,
        interrupted: false,
        activeSubagent: false,
      });
    }
    return this.sessionState.get(sessionID);
  }

  onUserInput(sessionID, { isSynthetic = false, metadata = null } = {}) {
    if (!sessionID) return this.activeTurnSeq(sessionID);
    if (isSynthetic || metadata?.lumitomeRedrive === true) return this.activeTurnSeq(sessionID);
    const next = this.activeTurnSeq(sessionID) + 1;
    this.turnSeqBySession.set(sessionID, next);
    const st = this.getState(sessionID);
    st.waitingForUser = false;
    st.interrupted = false;
    return next;
  }

  onCompactionStarted(sessionID) {
    if (sessionID) this.activeCompactions.add(sessionID);
  }

  onCompactionFinished(sessionID) {
    if (sessionID) this.activeCompactions.delete(sessionID);
  }

  markMutated(sessionID) {
    if (sessionID) this.getState(sessionID).wrote = true;
  }

  markWaitingForUser(sessionID, waiting = true) {
    if (sessionID) this.getState(sessionID).waitingForUser = Boolean(waiting);
  }

  markBlocked(sessionID, blocked = true) {
    if (sessionID) this.getState(sessionID).blocked = Boolean(blocked);
  }

  markInterrupted(sessionID, interrupted = true) {
    if (sessionID) this.getState(sessionID).interrupted = Boolean(interrupted);
  }

  markSubagentActive(sessionID, active = true) {
    if (sessionID) this.getState(sessionID).activeSubagent = Boolean(active);
  }

  _log(entry) {
    try {
      this.onTelemetry?.(entry);
    } catch {
      // telemetri fail-silent
    }
  }

  /**
   * Evaluasi keputusan Pre-Stop Gate pada hook experimental.idle.
   * Mengembalikan { action: "allow" | "bypass" | "redrive" | "circuit-open" | "deduplicated", ... }.
   */
  async handleIdle({ sessionID, background = [], snapshot = {}, ctx = null } = {}) {
    if (!sessionID) return { action: "allow", skipReason: "missing-session" };
    const turnSeq = this.activeTurnSeq(sessionID);
    const st = this.getState(sessionID);

    // [1] Feature flag SHarP off -> audit only
    if (String(this.env?.LUMI_IDLE_REDRIVE ?? "") === "0") {
      this._log({ kind: "idle-bypass", sessionID, turnSeq, reason: "flag-off" });
      return { action: "bypass", skipReason: "flag-off", turnSeq };
    }

    // [2] Background & Compaction & Subagent aktif
    const bgList = Array.isArray(background) ? background : [];
    const ownBg = bgList.some((item) => item && item.sessionID === sessionID);
    if (ownBg) {
      this._log({ kind: "idle-skip-background", sessionID, turnSeq, backgroundCount: bgList.length, scope: "own" });
      return { action: "allow", skipReason: "background-own", turnSeq };
    }
    const descendantActive = bgList.some(
      (item) => item && item.sessionID !== sessionID && (item.kind === "subagent" || item.kind === "codemode"),
    );
    if (descendantActive) {
      this._log({ kind: "idle-skip-background", sessionID, turnSeq, backgroundCount: bgList.length, scope: "descendant" });
      return { action: "allow", skipReason: "background-descendant", turnSeq };
    }
    const orphanChildShell = bgList.some((item) => item && item.sessionID !== sessionID && item.kind === "shell");
    if (orphanChildShell) {
      this._log({ kind: "idle-orphan-child-shell", sessionID, turnSeq, backgroundCount: bgList.length });
    }
    if (this.activeCompactions.has(sessionID) || snapshot.compactionRunning) {
      this._log({ kind: "idle-skip", sessionID, turnSeq, skipReason: "compaction-active" });
      return { action: "allow", skipReason: "compaction-active", turnSeq };
    }
    if (st.activeSubagent || snapshot.subagentActive) {
      this._log({ kind: "idle-skip", sessionID, turnSeq, skipReason: "subagent-active" });
      return { action: "allow", skipReason: "subagent-active", turnSeq };
    }

    // [2b] Interrupt / Waiting for user (question / BLOCKED)
    if (st.interrupted || snapshot.interrupted || snapshot.aborted) {
      this._log({ kind: "idle-skip", sessionID, turnSeq, skipReason: "user-interrupted" });
      return { action: "allow", skipReason: "user-interrupted", turnSeq };
    }
    if (st.waitingForUser || st.blocked || snapshot.waitingForUser || snapshot.blocked) {
      this._log({ kind: "idle-skip", sessionID, turnSeq, skipReason: "waiting-for-user" });
      return { action: "allow", skipReason: "waiting-for-user", turnSeq };
    }

    // [3] Evaluasi 2 kriteria fail-closed
    let failReason = null;
    if (snapshot.stateError) {
      failReason = "GATE_STATE_UNREADABLE";
    } else if (snapshot.delegationViolation) {
      failReason = "DELEGATION_BYPASS";
    } else {
      const hasMutations = Boolean(
        snapshot.wrote ||
        st.wrote ||
        snapshot.gitDiffNonEmpty ||
        snapshot.hasUnsettledFeatures ||
        (snapshot.bgPending ?? 0) > 0,
      );
      if (!hasMutations) {
        return { action: "allow", skipReason: "no-mutations", turnSeq };
      }

      const ran = snapshot.ran ?? 0;
      const lastExit = snapshot.lastExit;
      const maskedExit = Boolean(snapshot.maskedExit);
      const staleWitness = Boolean(snapshot.staleWitness);
      const bgPending = snapshot.bgPending ?? 0;
      const featuresAllPass = snapshot.featuresAllPass !== false;
      const scanOk =
        snapshot.sector !== "coding" ||
        snapshot.scanStatus === "PASS" ||
        snapshot.scanStatus === "WARN";

      const hasValidVerification =
        (snapshot.hasValidWitness === true || (ran > 0 && lastExit === 0)) &&
        !maskedExit &&
        !staleWitness &&
        bgPending === 0 &&
        featuresAllPass &&
        scanOk;

      if (!hasValidVerification) {
        failReason = "UNVERIFIED_STOP";
      }
    }

    // [4] Clean pass -> reset turn redrive state, izinkan idle
    const turnKey = `${sessionID}:${turnSeq}`;
    if (!failReason) {
      this.redrivesByTurn.delete(turnKey);
      return { action: "allow", skipReason: "verified-pass", turnSeq };
    }

    // [5] Circuit breaker keras (maxRedrives = 2) + idempotency
    const count = this.redrivesByTurn.get(turnKey) ?? 0;
    if (count >= this.maxRedrives) {
      this._log({
        kind: "idle-circuit-open",
        sessionID,
        turnSeq,
        attempt: count + 1,
        reason: failReason,
      });
      try {
        this.onWarning?.(
          `[lumitome-idle-gate] idle-circuit-open (${failReason}) setelah ${this.maxRedrives}x re-drive pada sesi ${sessionID}`,
        );
      } catch {}
      return {
        action: "circuit-open",
        reason: "idle-circuit-open",
        triggerReason: failReason,
        attempt: count + 1,
        turnSeq,
      };
    }

    const attempt = count + 1;
    const redriveId = buildRedriveId(sessionID, turnSeq, attempt, failReason);
    if (this.idempotencySet.has(redriveId)) {
      return { action: "deduplicated", id: redriveId, attempt, reason: failReason, turnSeq };
    }

    this.redrivesByTurn.set(turnKey, attempt);
    const text = buildCorrectivePrompt(failReason, snapshot);
    const payload = {
      sessionID,
      id: redriveId,
      delivery: "steer",
      description: `[Pre-Stop Gate] ${failReason} (${attempt}/${this.maxRedrives})`,
      metadata: { lumitomeRedrive: true, reason: failReason, attempt, turnSeq },
      text,
    };

    let injected = false;
    if (ctx) {
      const res = await sendSyntheticIdempotent(ctx, payload, { idempotencySet: this.idempotencySet });
      injected = Boolean(res.ok);
    } else {
      this.idempotencySet.add(redriveId);
    }

    this._log({
      kind: "idle-redrive",
      sessionID,
      turnSeq,
      attempt,
      reason: failReason,
      redriveId,
      injected,
    });

    return {
      action: "redrive",
      attempt,
      reason: failReason,
      id: redriveId,
      text,
      injected,
      turnSeq,
    };
  }
}
