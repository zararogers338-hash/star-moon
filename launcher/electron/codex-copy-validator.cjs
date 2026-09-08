const fs = require("node:fs");

function configIssues(config, mode, endpoint) {
  const issues = [];
  if (!config || typeof config !== "object") return ["invalid-config"];
  if (config.cli_auth_credentials_store !== "file") issues.push("credential-store-not-isolated");
  if (config.mcp_oauth_credentials_store !== "file") issues.push("mcp-credentials-not-isolated");
  if (config.profile !== undefined) issues.push("profile-override-needs-review");
  if (mode === "web") {
    const provider = config.model_providers?.star_moon_web;
    if (config.model_provider !== "star_moon_web" || provider?.base_url !== endpoint || provider?.requires_openai_auth !== false
      || provider?.env_key || provider?.auth || provider?.experimental_bearer_token) issues.push("web-route-changed");
    if (config.model_catalog_json !== "models.json" || typeof config.model !== "string" || !config.model.startsWith("chatgpt-web/")) issues.push("web-catalog-changed");
  }
  return issues;
}

if (require.main === module) {
  try {
    const [file, mode, endpoint] = process.argv.slice(2);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error("invalid file");
    const config = Bun.TOML.parse(fs.readFileSync(file, "utf8"));
    const issues = configIssues(config, mode, endpoint);
    process.stdout.write(JSON.stringify({ ok: issues.length === 0, issues }));
  } catch { process.stdout.write(JSON.stringify({ ok: false, issues: ["invalid-config"] })); }
}

module.exports = { configIssues };
