const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { validateRuntimeBundle } = require("../electron/runtime-install.cjs");

// Test only an already-installed Star Moon binary. No login or model call.
const executable = process.argv[2];
const version = require("../package.json").version;
if (process.platform !== "linux" || !executable || !path.isAbsolute(executable)) throw new Error("Pass the absolute installed Linux executable");
if (!fs.statSync(executable).isFile()) throw new Error("Installed executable not found");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "star-moon-installed-smoke-"));
const env = { ...process.env, TMPDIR:scratch, XDG_CONFIG_HOME:path.join(scratch,"xdg"), STAR_MOON_HOME:path.join(scratch,"core"), STAR_MOON_LAUNCHER_DATA_DIR:path.join(scratch,"launcher"), STAR_MOON_CODEX_HOME:path.join(scratch,"codex"), STAR_MOON_SMOKE_FILE:path.join(scratch,"ready.json") };
delete env.APPIMAGE; delete env.APPDIR; delete env.APPIMAGE_EXTRACT_AND_RUN;
delete env.VITE_DEV_SERVER_URL;
const normalConfig = path.join(os.homedir(),".codex","config.toml");
const digest = () => fs.existsSync(normalConfig) ? createHash("sha256").update(fs.readFileSync(normalConfig)).digest("hex") : null;
const beforeConfig = digest();
const results = [];
try {
  for (const pass of ["first-launch", "reopen"]) {
    if (fs.existsSync(env.STAR_MOON_SMOKE_FILE)) fs.unlinkSync(env.STAR_MOON_SMOKE_FILE);
    const result = spawnSync(executable, ["--launcher-smoke-test"], {env,encoding:"utf8",timeout:60000,maxBuffer:4*1024*1024,windowsHide:true});
    if (result.error || result.status !== 0) throw new Error(`${pass} failed (exit ${result.status}, signal ${result.signal}): ${result.error?.message || result.stderr.slice(-3000) || result.stdout.slice(-1000)}`);
    const marker = JSON.parse(fs.readFileSync(env.STAR_MOON_SMOKE_FILE,"utf8"));
    if (!marker.ok || !marker.packaged || !marker.runtimeVerified || marker.version !== version || marker.platform !== "linux") throw new Error("Invalid installed smoke receipt");
    validateRuntimeBundle(path.join(env.STAR_MOON_HOME,"versions",`${version}-linux-${process.arch}`),{version,platform:"linux",arch:process.arch});
    results.push({pass,...marker});
  }
  const normalCodexConfigChanged = beforeConfig !== digest();
  if (normalCodexConfigChanged) throw new Error("Normal Codex config changed during the test; preserve it and review, do not automatically restore it");
  console.log(JSON.stringify({installedExecutable:executable,results,accountsUsed:false,modelCalls:0,normalCodexConfigChanged}));
  fs.rmSync(scratch,{recursive:true,force:true});
} catch (error) {
  console.error(error.message);
  console.error(`Isolated diagnostics retained at ${scratch}`);
  process.exitCode=1;
}
