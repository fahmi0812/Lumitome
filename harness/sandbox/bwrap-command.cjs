/**
 * Canonical bwrap argv builder. Shared by the TypeScript runner and the
 * OpenCode plugin so sector shells cannot drift onto a second implementation.
 */

const fs = require("fs");
const { execSync } = require("child_process");

function isBwrapAvailable() {
  try {
    execSync("command -v bwrap", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function buildBwrapCommand(command, options) {
  const args = [];
  if (fs.existsSync("/usr")) args.push("--ro-bind", "/usr", "/usr");
  if (fs.existsSync("/bin")) args.push("--ro-bind", "/bin", "/bin");
  if (fs.existsSync("/lib")) args.push("--ro-bind", "/lib", "/lib");
  if (fs.existsSync("/lib64")) args.push("--ro-bind", "/lib64", "/lib64");
  if (fs.existsSync("/etc/alternatives")) args.push("--ro-bind", "/etc/alternatives", "/etc/alternatives");
  if (fs.existsSync("/etc/resolv.conf")) args.push("--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf");
  args.push("--proc", "/proc");
  args.push("--dev", "/dev");
  args.push("--tmpfs", "/tmp");
  if (options.readOnlyWorkspace) {
    args.push("--ro-bind", options.workspaceDir, options.workspaceDir);
  } else {
    args.push("--bind", options.workspaceDir, options.workspaceDir);
  }
  if (options.allowNetwork === false) args.push("--unshare-net");
  args.push("--chdir", options.workspaceDir);
  args.push("--die-with-parent");
  // ubuntu-latest uses a merged /usr. /bin/bash is often a symlink that does not
  // resolve after the bind, while /usr is always mounted above.
  const shell = fs.existsSync("/usr/bin/bash") ? "/usr/bin/bash" : "/bin/bash";
  args.push(shell, "-c", command);
  return { binary: "bwrap", args };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function bwrapShellInvocation(command, workspaceDir) {
  const built = buildBwrapCommand(command, { workspaceDir, allowNetwork: true });
  return [built.binary, ...built.args.map(shellQuote)].join(" ");
}

module.exports = {
  isBwrapAvailable,
  buildBwrapCommand,
  shellQuote,
  bwrapShellInvocation,
};
