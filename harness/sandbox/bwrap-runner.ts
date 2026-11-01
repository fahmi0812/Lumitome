/**
 * SuperQuantumAGI - Local Sandbox Runner (Bubblewrap / Docker)
 * Wraps subagent shell commands in an unprivileged bwrap container (PRD §9).
 * Argv construction lives in bwrap-command.cjs so the plugin uses the same builder.
 */

import { spawnSync } from "child_process";
import { buildBwrapCommand, isBwrapAvailable } from "./bwrap-command.cjs";

export interface BwrapOptions {
  workspaceDir: string;
  allowNetwork?: boolean;
  readOnlyWorkspace?: boolean;
  timeoutMs?: number;
}

export { buildBwrapCommand, isBwrapAvailable };

export function runInSandbox(command: string, options: BwrapOptions): { exitCode: number; stdout: string; stderr: string } {
  const built = buildBwrapCommand(command, options);
  const result = spawnSync(built.binary, built.args, {
    encoding: "utf8",
    timeout: options.timeoutMs ?? 60000,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
