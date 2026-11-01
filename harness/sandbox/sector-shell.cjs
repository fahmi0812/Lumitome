/**
 * Sector shell sandbox decision. Orchestrator and synthesizer are never wrapped.
 * Missing bwrap is fail-closed: deny, never fall through to a raw shell.
 */

const { isBwrapAvailable, bwrapShellInvocation } = require("./bwrap-command.cjs");

const SECTOR_IDS = new Set([
  "career",
  "coding",
  "data-doc-cad",
  "devops-infra-finance",
  "motion-media",
  "orchestration-quality",
  "osint",
  "research",
  "reverse-engineering",
  "security-pentest",
  "writing",
]);

const CLOSED_MESSAGE =
  "SANDBOX_CLOSED: sector shell refused because bwrap is unavailable. Raw shell fallback is disabled.";

const pending = [];

function canonicalAgentId(agent) {
  if (!agent) return "";
  const parts = String(agent).split("/");
  return parts[parts.length - 1] || String(agent);
}

function isSectorAgent(agent) {
  const id = canonicalAgentId(agent);
  if (!id || id === "orchestrator" || id === "synthesizer") return false;
  return String(agent).includes("sectors/") || SECTOR_IDS.has(id);
}

function decideSectorShell({ agent, command, cwd, bwrapAvailable, engine }) {
  if (!isSectorAgent(agent)) {
    return { effect: "allow", command };
  }
  const available = typeof bwrapAvailable === "boolean" ? bwrapAvailable : isBwrapAvailable();
  if (!available || engine === "bwrap" && available === false) {
    return { effect: "deny", message: CLOSED_MESSAGE };
  }
  if (!available) {
    return { effect: "deny", message: CLOSED_MESSAGE };
  }
  return {
    effect: "wrap",
    command: bwrapShellInvocation(command, cwd),
  };
}

function notePendingShell(agent, command) {
  if (!agent || typeof command !== "string") return;
  pending.push({ agent, command, at: Date.now() });
  const cutoff = Date.now() - 30000;
  while (pending.length > 0 && pending[0].at < cutoff) pending.shift();
}

function takePendingShell(command) {
  for (let i = pending.length - 1; i >= 0; i -= 1) {
    if (pending[i].command === command) return pending.splice(i, 1)[0].agent;
  }
  return undefined;
}

function shellCommandFromInput(input) {
  if (!input || typeof input !== "object") return undefined;
  if (typeof input.command === "string") return input.command;
  if (typeof input.cmd === "string") return input.cmd;
  return undefined;
}

function applyShellCreateBefore(event, options = {}) {
  if (typeof event.timeout === "number" && event.timeout > 120000) {
    event.timeout = 120000;
  }
  const agent = options.agent !== undefined ? options.agent : takePendingShell(event.command);
  const decision = decideSectorShell({
    agent,
    command: event.command,
    cwd: event.cwd,
    bwrapAvailable: options.bwrapAvailable,
    engine: options.engine !== undefined ? options.engine : process.env.SUPERQ_SANDBOX_ENGINE,
  });
  if (decision.effect === "wrap" && decision.command) {
    event.command = decision.command;
  }
  if (decision.effect === "deny") {
    event.command = "printf '%s\\n' 'SANDBOX_CLOSED: sector shell refused because bwrap is unavailable' >&2; exit 126";
    event.sandboxDenied = true;
  }
  return decision;
}

module.exports = {
  CLOSED_MESSAGE,
  isSectorAgent,
  decideSectorShell,
  notePendingShell,
  takePendingShell,
  shellCommandFromInput,
  applyShellCreateBefore,
};
