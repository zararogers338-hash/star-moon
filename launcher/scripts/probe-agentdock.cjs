// Opt-in, read-only connectivity probe. No OAuth registration or model calls.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { AgentDockBridge, validateMcpUrl } = require("../electron/agentdock-bridge.cjs");

async function probe(url, { bridgeFactory = options => new AgentDockBridge(options), signal } = {}) {
  url = validateMcpUrl(url);
  if (signal?.aborted) throw new Error("MCP probe cancelled");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "star-moon-agentdock-probe-"));
  let bridge;
  const cancel = () => { if (bridge) bridge.close().catch(() => {}); };
  try {
    bridge = bridgeFactory({ directory, openExternal: async () => { throw new Error("No login is allowed in this probe"); } });
    signal?.addEventListener("abort", cancel, { once: true });
    await bridge.configure({ url });
    if (signal?.aborted) throw new Error("MCP probe cancelled");
    const result = await bridge.inspect();
    if (signal?.aborted) throw new Error("MCP probe cancelled");
    return { state: result.state, authenticated: result.authenticated, tools: result.tools.length, serverName: result.serverName ?? null, inferenceUsed: false };
  } finally {
    signal?.removeEventListener("abort", cancel);
    // Do not remove the isolated home while an unconfirmed child can still use it.
    // A shutdown failure deliberately preserves this temporary directory.
    if (bridge) await bridge.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.length !== 3) throw new Error("Pass exactly one MCP URL to inspect");
  const controller = new AbortController();
  const interrupt = () => { process.exitCode = 130; controller.abort(); };
  process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
  try { console.log(JSON.stringify(await probe(process.argv[2], { signal: controller.signal }))); }
  finally { process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode ||= 1; });
module.exports = { probe };
