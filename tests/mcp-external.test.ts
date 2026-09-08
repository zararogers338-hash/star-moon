import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverMcpEndpoint, ExternalMcpClient } from "../src/mcp-external";

const temporaryRoots: string[] = [];
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("external MCP OAuth discovery", () => {
  test("records an OAuth/PKCE challenge without registering or sending credentials", async () => {
    const calls: string[] = [];
    const result = await discoverMcpEndpoint("https://mcp.example.test/mcp", async request => {
      calls.push(request.url);
      if (request.url.includes("oauth-protected-resource")) return Response.json({ resource: "https://mcp.example.test/mcp", authorization_servers: ["https://mcp.example.test"], bearer_methods_supported: ["header"] });
      if (request.url.endsWith("/mcp")) return new Response("unauthorized", { status: 401, headers: { "www-authenticate": 'Bearer resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/mcp"' } });
      return Response.json({ issuer: "https://mcp.example.test", authorization_endpoint: "https://mcp.example.test/oauth/authorize", token_endpoint: "https://mcp.example.test/oauth/token", code_challenge_methods_supported: ["S256"], grant_types_supported: ["authorization_code", "refresh_token"] });
    });
    expect(result.status).toBe("unauthorized");
    expect(result.pkceS256).toBe(true);
    expect(calls).toEqual([
      "https://mcp.example.test/mcp",
      "https://mcp.example.test/.well-known/oauth-protected-resource/mcp",
      "https://mcp.example.test/.well-known/oauth-authorization-server",
    ]);
  });

  test("rejects non-HTTPS endpoints and does not silently downgrade", async () => {
    await expect(discoverMcpEndpoint("http://mcp.example.test/mcp")).rejects.toThrow("HTTPS");
  });

  test("keeps the MCP session and acknowledges initialization", async () => {
    const root = mkdtempSync(join(tmpdir(), "star-moon-external-mcp-"));
    temporaryRoots.push(root);
    const tokenFile = join(root, "token");
    writeFileSync(tokenFile, "owner-only-test-token\n", { mode: 0o600 });
    chmodSync(tokenFile, 0o600);
    const calls: Array<{ method: string; session: string | null }> = [];
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      const input = args[0];
      const request = input instanceof Request ? input : new Request(input, args[1]);
      const body = JSON.parse(await request.clone().text()) as { method: string; id?: number };
      calls.push({ method: body.method, session: request.headers.get("mcp-session-id") });
      if (body.method === "initialize") {
        return Response.json({ jsonrpc: "2.0", id: body.id, result: {} }, { headers: { "mcp-session-id": "session-test" } });
      }
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      if (body.method === "tools/list") {
        return Response.json({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "read_file", inputSchema: { type: "object" } }] } }, { headers: { "mcp-session-id": "session-test" } });
      }
      return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "ok" }] } }, { headers: { "mcp-session-id": "session-test" } });
    }) as typeof fetch;
    const client = new ExternalMcpClient({ endpoint: "https://mcp.example.test/mcp", accessTokenFile: tokenFile });
    expect((await client.listTools()).map(tool => tool.wireName)).toEqual(["external__agentdock__read_file"]);
    await client.callTool("read_file", {});
    expect(calls).toEqual([
      { method: "initialize", session: null },
      { method: "notifications/initialized", session: "session-test" },
      { method: "tools/list", session: "session-test" },
      { method: "tools/call", session: "session-test" },
    ]);
  });
});
