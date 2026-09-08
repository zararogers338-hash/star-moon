export interface McpOAuthResourceMetadata {
  resource?: string;
  authorization_servers?: string[];
  bearer_methods_supported?: string[];
}

export interface McpOAuthServerMetadata {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  registration_endpoint?: string;
  code_challenge_methods_supported?: string[];
  grant_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
}

export interface McpEndpointDiscovery {
  endpoint: string;
  status: "unauthorized" | "ready" | "failed";
  httpStatus: number | null;
  resourceMetadataUrl: string | null;
  resourceMetadata?: McpOAuthResourceMetadata;
  authorizationServerMetadata?: McpOAuthServerMetadata;
  pkceS256: boolean;
  detail?: string;
}

export type McpDiscoveryFetch = (request: Request) => Promise<Response>;

export interface ExternalMcpConfig {
  endpoint: string;
  accessTokenFile: string;
}

export interface ExternalMcpTool {
  name: string;
  wireName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export function validateExternalMcpConfig(value: unknown): ExternalMcpConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("External MCP config must be an object");
  const input = value as Partial<ExternalMcpConfig>;
  const endpoint = safeHttpsUrl(String(input.endpoint ?? ""), "External MCP endpoint").toString();
  if (typeof input.accessTokenFile !== "string" || !input.accessTokenFile.trim()) throw new Error("External MCP accessTokenFile is required");
  return { endpoint, accessTokenFile: resolve(input.accessTokenFile.trim()) };
}

export function readExternalMcpAccessToken(config: ExternalMcpConfig): string {
  const validated = validateExternalMcpConfig(config);
  const stat = lstatSync(validated.accessTokenFile, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error("External MCP token file must be a regular file");
  if (stat.size > 4096) throw new Error("External MCP token file is too large");
  if (process.platform !== "win32") {
    if (stat.mode & 0o077) throw new Error("External MCP token file must be owner-only (0600)");
    try { chmodSync(validated.accessTokenFile, 0o600); } catch {}
  }
  const token = readFileSync(validated.accessTokenFile, "utf8").trim();
  if (token.length < 16 || /[\r\n]/.test(token)) throw new Error("External MCP token file contains an invalid token");
  return token;
}

function externalWireName(name: string): string {
  const normalized = name.replace(/[^A-Za-z0-9_$]/g, "_");
  if (!normalized) throw new Error("External MCP tool name is empty");
  return `external__agentdock__${normalized}`;
}

function parseJsonRpc(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {}
  const dataLine = text.split("\n").find(line => line.startsWith("data:"));
  if (dataLine) return parseJsonRpc(dataLine.slice(5).trim());
  throw new Error("External MCP response was not valid JSON-RPC");
}

export class ExternalMcpClient {
  readonly config: ExternalMcpConfig;
  private readonly accessToken: string;
  private requestId = 0;
  private sessionId: string | undefined;

  constructor(config: ExternalMcpConfig) {
    this.config = validateExternalMcpConfig(config);
    this.accessToken = readExternalMcpAccessToken(this.config);
  }

  private async call(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch(this.config.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": "2025-06-18",
        ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
      },
      redirect: "manual",
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.requestId, method, params }),
    });
    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId) this.sessionId = sessionId;
    if (response.status >= 300 && response.status < 400) throw new Error(`External MCP ${method} refused an HTTP redirect`);
    const text = await response.text();
    if (!text.trim()) {
      if (!response.ok) throw new Error(`External MCP ${method} failed with HTTP ${response.status}`);
      return {};
    }
    const body = parseJsonRpc(text);
    if (!response.ok) throw new Error(`External MCP ${method} failed with HTTP ${response.status}`);
    if (body.error && typeof body.error === "object") throw new Error(`External MCP ${method} returned an error`);
    return body;
  }

  private async notify(method: string, params: Record<string, unknown>): Promise<void> {
    const response = await fetch(this.config.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": "2025-06-18",
        ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
      },
      redirect: "manual",
      body: JSON.stringify({ jsonrpc: "2.0", method, params }),
    });
    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId) this.sessionId = sessionId;
    if (response.status >= 300 && response.status < 400) throw new Error(`External MCP ${method} refused an HTTP redirect`);
    if (!response.ok) throw new Error(`External MCP ${method} failed with HTTP ${response.status}`);
    // Consume the body even when a server answers a notification with an empty 202.
    await response.arrayBuffer();
  }

  async listTools(): Promise<ExternalMcpTool[]> {
    await this.call("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "star-moon", version: "5.0.2" },
    });
    await this.notify("notifications/initialized", {});
    const response = await this.call("tools/list", {});
    if (!response.result || typeof response.result !== "object" || !Array.isArray((response.result as { tools?: unknown }).tools)) {
      throw new Error("External MCP tools/list returned no tool catalog");
    }
    const tools = (response.result as { tools: unknown[] }).tools;
    return tools.flatMap(raw => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
      const item = raw as { name?: unknown; description?: unknown; inputSchema?: unknown };
      if (typeof item.name !== "string" || !/^[A-Za-z0-9_.-]{1,200}$/.test(item.name)) return [];
      const inputSchema = item.inputSchema && typeof item.inputSchema === "object" && !Array.isArray(item.inputSchema)
        ? item.inputSchema as Record<string, unknown>
        : { type: "object", additionalProperties: true };
      return [{ name: item.name, wireName: externalWireName(item.name), description: typeof item.description === "string" ? item.description.slice(0, 2_000) : "External MCP tool", inputSchema }];
    });
  }

  async callTool(name: string, argumentsValue: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await this.call("tools/call", { name, arguments: argumentsValue });
    return response.result && typeof response.result === "object" && !Array.isArray(response.result)
      ? response.result as Record<string, unknown>
      : { content: [{ type: "text", text: JSON.stringify(response.result ?? null) }] };
  }
}

function safeHttpsUrl(raw: string, label: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`${label} is not a URL`); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error(`${label} must be an HTTPS URL without credentials`);
  return url;
}

async function jsonBounded(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.length > 256 * 1024) throw new Error("MCP metadata response is too large");
  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("MCP metadata response is not an object");
  return value as Record<string, unknown>;
}

/** Discover OAuth/PKCE metadata without sending credentials or registering a client. */
export async function discoverMcpEndpoint(
  endpoint: string,
  fetchImpl: McpDiscoveryFetch = fetch,
): Promise<McpEndpointDiscovery> {
  const target = safeHttpsUrl(endpoint, "MCP endpoint");
  const base: McpEndpointDiscovery = {
    endpoint: target.toString(), status: "failed", httpStatus: null, resourceMetadataUrl: null, pkceS256: false,
  };
  let response: Response;
  try {
    response = await fetchImpl(new Request(target, { method: "GET", headers: { accept: "application/json, text/event-stream" }, redirect: "manual" }));
  } catch (error) {
    return { ...base, detail: error instanceof Error ? error.message : String(error) };
  }
  base.httpStatus = response.status;
  const challenge = response.headers.get("www-authenticate") ?? "";
  const match = challenge.match(/resource_metadata="([^"]+)"/i);
  if (!match) {
    return { ...base, status: response.ok ? "ready" : "failed", detail: response.ok ? undefined : "MCP endpoint did not provide OAuth resource metadata" };
  }
  let resourceUrl: URL;
  try { resourceUrl = safeHttpsUrl(match[1]!, "MCP resource metadata URL"); } catch (error) {
    return { ...base, detail: error instanceof Error ? error.message : String(error) };
  }
  base.resourceMetadataUrl = resourceUrl.toString();
  try {
    const resourceResponse = await fetchImpl(new Request(resourceUrl, { headers: { accept: "application/json" } }));
    if (!resourceResponse.ok) return { ...base, detail: `MCP resource metadata returned HTTP ${resourceResponse.status}` };
    const resource = await jsonBounded(resourceResponse) as McpOAuthResourceMetadata;
    base.resourceMetadata = resource;
    const authOrigin = resource.authorization_servers?.[0];
    if (!authOrigin) return { ...base, detail: "MCP resource metadata has no authorization server" };
    const authUrl = safeHttpsUrl(authOrigin, "MCP authorization server");
    const metadataResponse = await fetchImpl(new Request(new URL("/.well-known/oauth-authorization-server", authUrl), { headers: { accept: "application/json" } }));
    if (!metadataResponse.ok) return { ...base, detail: `MCP authorization metadata returned HTTP ${metadataResponse.status}` };
    const metadata = await jsonBounded(metadataResponse) as McpOAuthServerMetadata;
    base.authorizationServerMetadata = metadata;
    base.pkceS256 = metadata.code_challenge_methods_supported?.includes("S256") === true;
    if (!metadata.authorization_endpoint || !metadata.token_endpoint || !base.pkceS256) {
      return { ...base, detail: "MCP OAuth metadata is missing an authorization endpoint, token endpoint, or S256 PKCE" };
    }
    return { ...base, status: "unauthorized" };
  } catch (error) {
    return { ...base, detail: error instanceof Error ? error.message : String(error) };
  }
}
import { chmodSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
