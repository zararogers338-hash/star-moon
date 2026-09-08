const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validateRuntimeBundle } = require("../electron/runtime-install.cjs");
const { validatePublicPayload } = require("../electron/packaging-permissions.cjs");

// Only public build products are written by this command, never user profiles.
process.umask(0o022);

const root = path.resolve(__dirname, "..");
const launcherManifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const executable = "node";
const electronBuilderCli = require.resolve("electron-builder/out/cli/cli.js", { paths: [root] });
const requested = process.argv[2];
const requestedLinuxFormat = process.argv[3];
if (requestedLinuxFormat && (requested !== "--linux" || !["deb", "rpm", "AppImage"].includes(requestedLinuxFormat))) {
  throw new Error("An explicit Linux format must be deb, rpm, or AppImage");
}
const target = requested || (process.platform === "darwin" ? "--mac"
  : process.platform === "win32" ? "--win"
    : process.platform === "linux" ? "--linux"
      : null);
if (!["--mac", "--win", "--linux"].includes(target)) {
  throw new Error(`Unsupported packaging target: ${requested || process.platform}`);
}
const nativeTarget = process.platform === "darwin" ? "--mac"
  : process.platform === "win32" ? "--win"
    : process.platform === "linux" ? "--linux"
      : null;
if (target !== nativeTarget) {
  throw new Error(
    `Cross-packaging ${target} from ${process.platform}/${process.arch} is disabled because the launcher embeds a native Bun runtime. `
    + "Build each target on its matching operating system.",
  );
}

// Refuse an incomplete or polluted runtime before building/replacing any package.
validateRuntimeBundle(path.join(root, "build", "runtime"), {
  version: launcherManifest.version, platform: process.platform, arch: process.arch,
});
validatePublicPayload(path.join(root, "build", "runtime"));
validatePublicPayload(path.join(root, "dist"));

const env = { ...process.env };
if (!env.CSC_LINK && !env.CSC_NAME) env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
const builderArgs = [
  electronBuilderCli,
  target,
  ...(requestedLinuxFormat ? [requestedLinuxFormat] : []),
  "--publish",
  "never",
];
if (target === "--mac" && !env.CSC_LINK && !env.CSC_NAME) {
  builderArgs.push("--config.mac.identity=-");
}

const staging = fs.mkdtempSync(path.join(os.tmpdir(), "star-moon-package-"));
const artifactsDirectory = path.join(root, "artifacts");
let artifactHistoryDirectory = null;

function publishArtifact(artifact) {
  const publicName = artifact.name.replace(/-linux-x86_64(?=\.)/, "-linux-x64");
  if (!publicName.startsWith("star-moon-")) throw new Error("Refusing to publish an artifact without Star Moon identity");
  const artifactRootMetadata = fs.lstatSync(artifactsDirectory);
  if (!artifactRootMetadata.isDirectory() || artifactRootMetadata.isSymbolicLink()) throw new Error("Artifact output must be a regular owned directory");
  const destination = path.join(artifactsDirectory, publicName);
  if (fs.existsSync(destination)) {
    const metadata = fs.lstatSync(destination);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Existing artifact must be a regular owned file");
    if (!artifactHistoryDirectory) {
      const historyRoot = path.join(artifactsDirectory, "history");
      fs.mkdirSync(historyRoot, { recursive: true });
      if (!fs.lstatSync(historyRoot).isDirectory()) throw new Error("Artifact history must be a regular owned directory");
      artifactHistoryDirectory = fs.mkdtempSync(path.join(historyRoot, `${new Date().toISOString().replace(/[:.]/g, "-")}-`));
    }
    fs.copyFileSync(destination, path.join(artifactHistoryDirectory, publicName), fs.constants.COPYFILE_EXCL);
  }
  // Preserve rollback copies before replacing a same-name artifact atomically.
  // Older versions and upstream-named distributables are deliberately untouched.
  const temporary = fs.mkdtempSync(path.join(artifactsDirectory, ".star-moon-publish-"));
  try {
    const staged = path.join(temporary, publicName);
    fs.copyFileSync(path.join(staging, artifact.name), staged, fs.constants.COPYFILE_EXCL);
    fs.renameSync(staged, destination);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function runChecked(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed with status ${result.status ?? "unknown"}`);
  }
}

function verifySignedMacArchive() {
  const archives = fs.readdirSync(staging)
    .filter(name => /-mac-(?:arm64|x64)\.zip$/.test(name));
  if (archives.length !== 1) {
    throw new Error(`Expected exactly one macOS ZIP for verification; found ${archives.join(", ") || "none"}`);
  }
  const verificationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-web-gpt-mac-verify-"));
  try {
    runChecked("ditto", ["-x", "-k", path.join(staging, archives[0]), verificationRoot]);
    const appBundle = path.join(verificationRoot, `${launcherManifest.build.productName}.app`);
    runChecked("codesign", ["--verify", "--deep", "--strict", appBundle]);
    validateRuntimeBundle(path.join(appBundle, "Contents", "Resources", "runtime"), {
      version: launcherManifest.version,
      platform: "darwin",
      arch: process.arch,
    });
  } finally {
    fs.rmSync(verificationRoot, { recursive: true, force: true });
  }
}

function verifyLinuxAppImage(stagingRoot) {
  const appImageName = /^star-moon-.*\.AppImage$/i;
  const appImage = fs.readdirSync(stagingRoot, { withFileTypes: true })
    .find((entry) => entry.isFile() && appImageName.test(entry.name));
  if (!appImage) throw new Error("Linux packaging produced no Star Moon AppImage to verify");
  runChecked(path.join(root, "scripts", "smoke-linux-appimage-symbols.sh"), [
    path.join(stagingRoot, appImage.name),
  ]);
}

try {
  const result = spawnSync(executable, [
    ...builderArgs,
    `--config.directories.output=${staging}`,
  ], {
    cwd: root,
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (target === "--mac") verifySignedMacArchive();
  if (target === "--linux") validateRuntimeBundle(path.join(staging, process.arch === "x64" ? "linux-unpacked" : `linux-${process.arch}-unpacked`, "resources", "runtime"), {
    version: launcherManifest.version, platform: "linux", arch: process.arch,
  });
  if (target === "--linux") validatePublicPayload(path.join(staging, process.arch === "x64" ? "linux-unpacked" : `linux-${process.arch}-unpacked`));
  if (target === "--linux" && (!requestedLinuxFormat || requestedLinuxFormat === "AppImage")) {
    verifyLinuxAppImage(staging);
  }

  fs.mkdirSync(artifactsDirectory, { recursive: true });
  const artifacts = fs.readdirSync(staging, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:AppImage|deb|rpm|dmg|exe|zip|blockmap)$/i.test(entry.name));
  if (!artifacts.some((entry) => /\.(?:AppImage|deb|rpm|dmg|exe|zip)$/i.test(entry.name))) {
    throw new Error(`electron-builder produced no distributable artifact in ${staging}`);
  }
  for (const artifact of artifacts) publishArtifact(artifact);
  if (artifactHistoryDirectory) process.stdout.write(`Previous distributables preserved in ${artifactHistoryDirectory}\n`);
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
