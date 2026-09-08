const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const PRODUCTION_PROFILE = "production";
const DEVELOPMENT_PROFILE = "development";

function resolveUserPath(value, homeDir = os.homedir()) {
  if (value === "~") return homeDir;
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.resolve(homeDir, value.slice(2));
  }
  return path.resolve(value);
}

function canonicalPath(value) {
  let existing = path.resolve(value);
  const suffix = [];
  while (true) {
    try { return path.join(fs.realpathSync(existing), ...suffix); }
    catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw new Error("Cannot verify Star Moon data path isolation");
      const parent = path.dirname(existing);
      if (parent === existing) throw new Error("Cannot verify Star Moon data path isolation");
      suffix.unshift(path.basename(existing));
      existing = parent;
    }
  }
}

function pathsOverlap(left, right) {
  const inside = (parent, child) => {
    const relative = path.relative(parent, child);
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  };
  left = canonicalPath(left); right = canonicalPath(right);
  return inside(left, right) || inside(right, left);
}

function resolveLauncherProfile({
  argv = process.argv,
  env = process.env,
  homeDir = os.homedir(),
  appData,
} = {}) {
  if (typeof appData !== "string" || !path.isAbsolute(appData)) {
    throw new Error("Launcher profile resolution requires an absolute appData path");
  }
  const development = argv.includes("--dev-profile");
  const configured = (name, fallback) => env[name]?.trim() ? resolveUserPath(env[name].trim(), homeDir) : fallback;
  const productionHome = configured("STAR_MOON_HOME", path.join(homeDir, ".star-moon"));
  const productionData = configured("STAR_MOON_LAUNCHER_DATA_DIR", path.join(appData, "Star Moon"));
  const developmentHome = configured("STAR_MOON_DEV_HOME", path.join(homeDir, ".star-moon-dev"));
  // This is an integration target, not a source of launcher state or cookies.
  // Only the existing explicit model-install workflow may write its config.
  const explicitCodexHome = Boolean(env.STAR_MOON_CODEX_HOME?.trim());
  const integrationCodexHome = configured("STAR_MOON_CODEX_HOME", configured("CODEX_HOME", path.join(homeDir, ".codex")));
  const coreHome = development ? developmentHome : productionHome;
  const userData = development ? path.join(coreHome, "launcher") : productionData;
  const legacyHomes = [
    path.join(homeDir, ".codex-chatgpt-web"), path.join(homeDir, ".codex-chatgpt-web-dev"),
    path.join(appData, "Codex Web GPT"), path.join(homeDir, ".codex"),
    ...["CODEX_CHATGPT_WEB_HOME", "CODEX_WEB_GPT_LAUNCHER_DATA_DIR", "CODEX_WEB_GPT_DEV_HOME"]
      .filter(name => env[name]?.trim()).map(name => resolveUserPath(env[name].trim(), homeDir)),
  ];
  const otherProfileHomes = development ? [productionHome, productionData] : [developmentHome];
  const ownedNestedCodexHome = !development && explicitCodexHome
    && canonicalPath(integrationCodexHome) === path.join(canonicalPath(coreHome), "codex-home");
  for (const directory of [coreHome, userData]) {
    if ([path.parse(directory).root, homeDir, appData, os.tmpdir()].some(broad => canonicalPath(directory) === canonicalPath(broad))) {
      throw new Error("Star Moon requires a dedicated data directory, not a broad system or home directory");
    }
    if (legacyHomes.some(legacy => pathsOverlap(directory, legacy))) {
      throw new Error("Star Moon data directories must not overlap existing Codex or Codex Web GPT homes");
    }
    if (otherProfileHomes.some(other => pathsOverlap(directory, other))) {
      throw new Error("DEV profile home must differ from the production Star Moon home and data directory");
    }
    if (!development && pathsOverlap(directory, integrationCodexHome)
      && !(directory === coreHome && ownedNestedCodexHome)) {
      throw new Error("Star Moon Codex target overlaps application data");
    }
  }
  // Explicit production targets are allowed below Star Moon's dedicated core,
  // but never overlap legacy Codex homes, launcher data, or another profile.
  if (explicitCodexHome && !development) {
    if ([path.parse(integrationCodexHome).root, homeDir, appData, os.tmpdir()].some(broad => canonicalPath(integrationCodexHome) === canonicalPath(broad))) {
      throw new Error("Star Moon Codex target must be a dedicated directory");
    }
    if (legacyHomes.some(legacy => pathsOverlap(integrationCodexHome, legacy))
      || pathsOverlap(integrationCodexHome, userData)
      || otherProfileHomes.some(other => pathsOverlap(integrationCodexHome, other))) {
      throw new Error("Star Moon Codex target overlaps an existing profile or legacy home");
    }
  }
  return {
    kind: development ? DEVELOPMENT_PROFILE : PRODUCTION_PROFILE,
    displayName: development ? "Star Moon DEV" : "Star Moon",
    appId: development ? "dev.starmoon.launcher.dev" : "dev.starmoon.launcher",
    windowClass: development ? "star-moon-dev" : "star-moon",
    coreHome,
    codexHome: development ? path.join(coreHome, "codex-home") : integrationCodexHome,
    userData,
    browserPartition: development ? "persist:star-moon-dev-chatgpt" : "persist:star-moon-chatgpt",
  };
}

module.exports = {
  DEVELOPMENT_PROFILE,
  PRODUCTION_PROFILE,
  resolveLauncherProfile,
};
