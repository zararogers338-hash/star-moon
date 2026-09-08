const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Runtime bundles contain public program files, not browser/session secrets.
process.umask(0o022);

const launcherRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(launcherRoot, "..");
const output = path.join(launcherRoot, "build", "runtime");
const configuredBun = process.env.CODEX_WEB_GPT_BUN || process.execPath;
let temporaryBunDirectory;

function bunOutsideOutput() {
  const candidate = path.resolve(configuredBun);
  const relative = path.relative(output, candidate);
  const isInsideOutput = relative === "" || (relative && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  if (!isInsideOutput) return candidate;

  // build-runtime-bundle.ts replaces the complete output directory before it copies the
  // embedded Bun. If the caller itself is that embedded Bun, copying it first prevents the
  // packaging process from deleting the executable that is still running the build.
  temporaryBunDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "star-moon-bun-"));
  const copy = path.join(temporaryBunDirectory, path.basename(candidate));
  fs.copyFileSync(candidate, copy);
  fs.chmodSync(copy, fs.statSync(candidate).mode & 0o777);
  return copy;
}

const bun = bunOutsideOutput();

try {
  const result = spawnSync(bun, ["run", "scripts/build-runtime-bundle.ts", output], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);

  const notices = spawnSync(bun, [
    "run",
    "scripts/generate-third-party-notices.ts",
    path.join(output, "THIRD_PARTY_NOTICES.txt"),
    "--include-launcher",
  ], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (notices.error) throw notices.error;
  if (notices.status !== 0) process.exit(notices.status ?? 1);
  fs.copyFileSync(path.join(repositoryRoot, "LICENSE"), path.join(output, "LICENSE"));
  fs.cpSync(path.join(repositoryRoot, "LICENSES"), path.join(output, "LICENSES"), { recursive: true });
} finally {
  if (temporaryBunDirectory) fs.rmSync(temporaryBunDirectory, { recursive: true, force: true });
}
