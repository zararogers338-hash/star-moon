const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { configIssues } = require("./codex-copy-validator.cjs");

// Deliberately do not inherit OPENAI_*, CODEX_*, provider keys or host MCP tools.
function isolatedEnvironment(home, desktop, source = process.env) {
  const allowed = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "COLORTERM", "DISPLAY", "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "XDG_SESSION_TYPE", "DBUS_SESSION_BUS_ADDRESS", "XAUTHORITY", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy", "SSL_CERT_FILE", "SSL_CERT_DIR"];
  const env = Object.fromEntries(allowed.filter(key => typeof source[key] === "string").map(key => [key, source[key]]));
  env.CODEX_HOME = home;
  env.CODEX_ELECTRON_USER_DATA_PATH = desktop;
  return env;
}

function launchSpec(root, manifest, desktop, args = []) {
  if (!path.isAbsolute(root) || manifest?.version !== 1 || !/^[a-f0-9-]{36}$/.test(manifest.id)) throw new Error("SM_COPY_INVALID_MANIFEST");
  const executable = desktop ? manifest.desktopExecutable : manifest.codexExecutable;
  if (typeof executable !== "string" || !path.isAbsolute(executable)) throw new Error(desktop ? "SM_COPY_DESKTOP_UNAVAILABLE" : "SM_COPY_CODEX_NOT_FOUND");
  return { executable, args: desktop ? [`--user-data-dir=${path.join(root, "desktop")}`] : args,
    cwd: path.join(root, "workspace"), env: isolatedEnvironment(path.join(root, "home"), path.join(root, "desktop")) };
}

if (require.main === module) {
  try {
    const root = __dirname;
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
    const configFile = path.join(root, "home", "config.toml"), stat = fs.lstatSync(configFile);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024
      || configIssues(Bun.TOML.parse(fs.readFileSync(configFile, "utf8")), manifest.mode, manifest.endpoint).length) {
      throw new Error("SM_COPY_CONFIG_REQUIRES_REVIEW");
    }
    const args = process.argv.slice(2), desktop = args[0] === "--desktop";
    const spec = launchSpec(root, manifest, desktop, args);
    const child = spawn(spec.executable, spec.args, { cwd: spec.cwd, env: spec.env,
      stdio: desktop ? "ignore" : "inherit", detached: desktop, windowsHide: false });
    child.once("error", () => { process.stderr.write("SM_COPY_LAUNCH_FAILED: Check the installed Codex path.\n"); process.exitCode = 1; });
    if (desktop) child.unref();
    else child.once("exit", code => { process.exitCode = code ?? 1; });
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { isolatedEnvironment, launchSpec };
