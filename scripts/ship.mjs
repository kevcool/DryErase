import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) {
    console.error(`Unable to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function assertCleanWorktree() {
  const status = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  if (status.error || status.status !== 0) {
    console.error("Unable to check the Git worktree status.");
    process.exit(1);
  }

  if (status.stdout.trim()) {
    console.error("Refusing to ship with uncommitted changes. Commit or stash them first.");
    process.exit(1);
  }
}

assertCleanWorktree();
run("npm", ["run", "verify"]);
assertCleanWorktree();
run("git", ["push"]);
