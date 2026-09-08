import { defaultBrokerEndpoint, resolveBrokerEndpoint } from "../../config";
import { runChatGptMcpServer, type ChatGptMcpContract } from "./mcp-server";
import { ExternalMcpClient, validateExternalMcpConfig } from "../../mcp-external";

function option(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1]?.trim();
  if (!value) throw new Error(`${name} requires a value`);
  args.splice(index, 2);
  return value;
}

export async function runChatGptMcpMain(args: string[]): Promise<void> {
  const remaining = [...args];
  const brokerSocketPath = resolveBrokerEndpoint(option(remaining, "--broker-socket", defaultBrokerEndpoint()));
  const requestedContract = option(remaining, "--contract", "native");
  if (requestedContract !== "native" && requestedContract !== "safe") {
    throw new Error(`--contract must be native or safe, received ${requestedContract}`);
  }
  const externalUrl = option(remaining, "--external-mcp-url", "");
  const externalTokenFile = option(remaining, "--external-mcp-token-file", "");
  let externalMcp: ExternalMcpClient | undefined;
  if (externalUrl || externalTokenFile) {
    if (!externalUrl || !externalTokenFile) throw new Error("--external-mcp-url and --external-mcp-token-file must be provided together");
    externalMcp = new ExternalMcpClient(validateExternalMcpConfig({ endpoint: externalUrl, accessTokenFile: externalTokenFile }));
  }
  if (remaining.length > 0) throw new Error(`Unknown MCP arguments: ${remaining.join(" ")}`);
  await runChatGptMcpServer({
    brokerSocketPath,
    contract: requestedContract as ChatGptMcpContract,
    ...(externalMcp ? { externalMcp } : {}),
  });
}
