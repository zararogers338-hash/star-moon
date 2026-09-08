#!/usr/bin/env bun
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { timingSafeEqual } from "node:crypto";
import { existsSync, rmSync, readFileSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { stdin, stdout } from "node:process";
import { captureSystemBrowserLoginToFile, checkBrowserEngine, loginToChatGpt } from "./browser-login";
import { CHATGPT_CONNECTOR_NAME, defaultConfig, getConfigDir, getConfigPath, loadConfig, loadConfigForSetup } from "./config";
import {
  inspectLauncherBrowserHost,
  inspectLauncherBrowserHostLiveness,
  readLauncherBrowserHostDescriptor,
} from "./launcher-browser-host";
import {
  activateCodexIntegration,
  deactivateCodexIntegration,
  inspectCodexIntegration,
  readCodexSubagentProtocol,
  setCodexSubagentProtocol,
  uninstallCodexIntegration,
} from "./codex-integration";
import { formatDoctorReport, runDoctor } from "./doctor";
import { readCatalogStatus } from "./codex-client-status";
import { augmentNativeModelCatalog } from "./model-catalog";
import { installCodexInterruptHook } from "./codex-interrupt-hook";
import { runChatGptMcpMain } from "./adapters/chatgpt-web/mcp-main";
import { runCommand } from "./process";
import { startServer } from "./server";
import { assertServiceIdle, cancelActiveTurns, getServiceStatus, installService, interruptActiveTurn, restartService, startService, stopService, uninstallService } from "./service";
import { existingFullSetupCredentials, preflightSetup, setup, type SetupOptions } from "./setup";
import { installRuntimeKeyBytes, managedRuntimeKeyPath, stopTunnel, tunnelStatus, waitForTunnelReady } from "./tunnel";
import { getTunnelServiceStatus, restartTunnelService, startTunnelService, stopTunnelService, uninstallTunnelService } from "./tunnel-service";
import { VERSION } from "./version";
import { runDevCommand } from "./dev-chat/cli";
import { probeCockpitModels, readCockpitClientApiKey, validateCockpitConfig } from "./cockpit-provider";
import { readCockpitEvidence, summarizeCockpitEvidence } from "./cockpit-evidence";
import { cockpitProfileBackupPath, cockpitProfilePath, readStoredCockpitProfile, removeStoredCockpitProfile, rollbackStoredCockpitProfile, saveStoredCockpitProfile } from "./cockpit-profile";

const HELP = `codex-chatgpt-web ${VERSION}

Focused ChatGPT web-backed models for the native Codex harness.

Usage:
  codex-chatgpt-web setup --browser-only [options]
  codex-chatgpt-web setup --full --tunnel-id ID --runtime-key-file PATH [options]
  codex-chatgpt-web login
  codex-chatgpt-web doctor [--json]
  codex-chatgpt-web route <status|connect|disconnect>
  codex-chatgpt-web subagents <status|compatibility-v1|native>
  codex-chatgpt-web browser check
  codex-chatgpt-web dev launcher
  codex-chatgpt-web dev status [--json]
  codex-chatgpt-web dev setup <--browser-only|--full> [options]
  codex-chatgpt-web dev chat NAME [--model MODEL] [MESSAGE]
  codex-chatgpt-web dev list
  codex-chatgpt-web serve
  codex-chatgpt-web mcp [--broker-socket PATH]
  codex-chatgpt-web service <status|install|start|restart|stop|cancel-turns>
  codex-chatgpt-web route client-status   Read-only client routing and catalog diagnostics
  codex-chatgpt-web tunnel <status|start|restart|stop|key-import>
  codex-chatgpt-web cockpit <status|configure|probe|client-key|rollback|evidence|clear>
  cockpit configure --base-url URL --api-key-file PATH [--models LIST] [--routing-file JSON]
  codex-chatgpt-web open <tunnels|runtime-keys|connectors>
  codex-chatgpt-web uninstall --yes

Setup options:
  --browser-only               Account-eligible Web models, full context/images, no local tools or tunnel
  --full                       Account-eligible Web models with tools through the configured connector
  --automatic-browser-interaction
                               Send prompts and read ChatGPT state through browser automation (default)
  --zero-risk-browser-interaction
                               Full mode: select, paste, and send in the launcher yourself
  --zero-risk-pro              Zero Risk: also install the explicit Pro-sized model row
  --zero-risk-default          Zero Risk: install only the default model row
  --port NUMBER                Loopback Responses port (default: 17841)
  --chrome PATH                Google Chrome/Chromium executable used for account login
  --browser-host-descriptor PATH
                               Use the embedded launcher browser described by this owner-only file
  --refresh-account-capabilities
                               Re-read the authenticated account's available Web models
  --app-name NAME              Automatic-mode ChatGPT connector name (default: ${CHATGPT_CONNECTOR_NAME})
  --tunnel-id ID               Existing OpenAI tunnel id (full mode)
  --runtime-key-file PATH      File containing a Tunnels Read+Use runtime key
  --replace-codex-route        Reversibly replace existing Responses or Voice route settings
  --subagent-protocol MODE     compatibility-v1 (default) or native (advanced)
  --restart-service            Explicitly restart this project's daemon after an update
  --login                      Refresh the stored ChatGPT login even if one exists
  --auto-approve-tool-calls    Opt in to per-call browser clicks on "Allow once" prompts
  --bigger-context             Enable experimental adaptive 1/2/3-message context
  --standard-context           Disable experimental multi-message context
  --acknowledge-unofficial     Accept the one-time unofficial-browser-automation notice

Global:
  --home PATH                  Override ~/.codex-chatgpt-web
  -h, --help
  -v, --version
`;

function takeOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  args.splice(index, 2);
  return value;
}

function takeFlag(args: string[], name: string): boolean {
  const index = args.indexOf(name);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

async function confirm(question: string): Promise<boolean> {
  if (!stdin.isTTY || !stdout.isTTY) return false;
  const reader = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await reader.question(`${question} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    reader.close();
  }
}

async function prompt(question: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY) return "";
  const reader = createInterface({ input: stdin, output: stdout });
  try { return (await reader.question(question)).trim(); }
  finally { reader.close(); }
}

async function secretPrompt(question: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY) return "";
  stdout.write(question);
  const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const reader = createInterface({ input: stdin, output: muted, terminal: true });
  try { return (await reader.question("")).trim(); }
  finally {
    reader.close();
    stdout.write("\n");
  }
}

function assertNoArgs(args: string[]): void {
  if (args.length > 0) throw new Error(`Unknown arguments: ${args.join(" ")}`);
}

function authorizeLauncherControl(operation: string): void {
  const descriptorPath = process.env.CODEX_CHATGPT_WEB_BROWSER_HOST_DESCRIPTOR?.trim();
  const supplied = process.env.CODEX_WEB_GPT_LAUNCHER_CONTROL_TOKEN?.trim();
  delete process.env.CODEX_WEB_GPT_LAUNCHER_CONTROL_TOKEN;
  if (!descriptorPath || !supplied) {
    throw new Error(`Launcher-controlled ${operation} requires a live launcher authorization`);
  }
  const descriptor = readLauncherBrowserHostDescriptor(descriptorPath);
  const expectedBytes = Buffer.from(descriptor.control.token);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    throw new Error(`Launcher-controlled ${operation} authorization is invalid`);
  }
}

function launcherLoginContinuation(): { promise: Promise<void>; close: () => void } {
  const maxBytes = 1_024;
  let buffered = "";
  let bytes = 0;
  let settled = false;
  let resolveContinuation!: () => void;
  let rejectContinuation!: (error: Error) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolveContinuation = resolve;
    rejectContinuation = reject;
  });
  const cleanup = () => {
    stdin.off("data", onData);
    stdin.off("end", onEnd);
    stdin.pause();
  };
  const fail = (message: string) => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectContinuation(new Error(message));
  };
  const onData = (chunk: Buffer | string) => {
    if (settled) return;
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += data.length;
    if (bytes > maxBytes) {
      fail("Launcher passkey control message is too large");
      return;
    }
    buffered += data.toString("utf8");
    const newline = buffered.indexOf("\n");
    if (newline < 0) return;
    const line = buffered.slice(0, newline);
    if (buffered.slice(newline + 1).trim()) {
      fail("Launcher passkey control sent unexpected trailing data");
      return;
    }
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      fail("Launcher passkey control sent invalid JSON");
      return;
    }
    if (!message || typeof message !== "object"
      || (message as { version?: unknown }).version !== 1
      || (message as { type?: unknown }).type !== "passkey-login-continue") {
      fail("Launcher passkey control sent an invalid continuation message");
      return;
    }
    settled = true;
    cleanup();
    resolveContinuation();
  };
  const onEnd = () => fail("Launcher closed the passkey control channel before Continue");
  stdin.on("data", onData);
  stdin.once("end", onEnd);
  stdin.resume();
  return {
    promise,
    close: () => {
      if (settled) return;
      settled = true;
      cleanup();
    },
  };
}

async function loginCommand(args: string[]): Promise<void> {
  const launcherControl = takeFlag(args, "--launcher-control");
  if (!launcherControl) {
    assertNoArgs(args);
    const config = loadConfig();
    if (config.browserHost === "launcher") {
      throw new Error("ChatGPT login is owned by the launcher; open Codex Web GPT and use its Sign in step");
    }
    const result = await loginToChatGpt(config);
    stdout.write(`ChatGPT login stored at ${result.storageStatePath}\n`);
    return;
  }

  const chromeExecutablePath = takeOption(args, "--chrome");
  const storageStatePath = takeOption(args, "--storage-state");
  assertNoArgs(args);
  authorizeLauncherControl("passkey login");
  if (process.platform !== "darwin" && process.platform !== "linux") throw new Error("External browser sign-in is currently supported only on macOS and Linux");
  if (!chromeExecutablePath || !isAbsolute(chromeExecutablePath)) {
    throw new Error("Launcher passkey sign-in requires --chrome with an absolute path");
  }
  if (!storageStatePath || !isAbsolute(storageStatePath)) {
    throw new Error("Launcher passkey sign-in requires --storage-state with an absolute path");
  }
  const continuation = launcherLoginContinuation();
  try {
    await captureSystemBrowserLoginToFile({
      ...defaultConfig(),
      chromeExecutablePath,
      storageStatePath,
    }, { continuation: continuation.promise });
  } finally {
    continuation.close();
  }
  stdout.write("Passkey session captured for Launcher verification.\n");
}

async function setupCommand(args: string[]): Promise<void> {
  const preflightOnly = takeFlag(args, "--preflight-only");
  const browserOnly = takeFlag(args, "--browser-only");
  const full = takeFlag(args, "--full");
  if (browserOnly === full) throw new Error("Choose exactly one setup mode: --browser-only or --full");
  const portRaw = takeOption(args, "--port");
  let acknowledged = takeFlag(args, "--acknowledge-unofficial");
  const options: SetupOptions = {
    mode: full ? "full" : "browser-only",
    ...(portRaw ? { port: Number(portRaw) } : {}),
  };
  const automaticBrowserInteraction = takeFlag(args, "--automatic-browser-interaction");
  const manualBrowserInteraction = takeFlag(args, "--zero-risk-browser-interaction");
  if (automaticBrowserInteraction && manualBrowserInteraction) {
    throw new Error(
      "Choose at most one browser interaction mode: --automatic-browser-interaction or --zero-risk-browser-interaction",
    );
  }
  if (automaticBrowserInteraction || manualBrowserInteraction) {
    options.browserInteractionMode = manualBrowserInteraction ? "manual" : "automatic";
  }
  const subagentProtocol = takeOption(args, "--subagent-protocol");
  if (subagentProtocol !== undefined) {
    if (subagentProtocol !== "compatibility-v1" && subagentProtocol !== "native") {
      throw new Error("--subagent-protocol must be compatibility-v1 or native");
    }
    options.subagentProtocol = subagentProtocol;
  }
  const appName = takeOption(args, "--app-name");
  const tunnelId = takeOption(args, "--tunnel-id");
  const runtimeKeyFile = takeOption(args, "--runtime-key-file");
  const chrome = takeOption(args, "--chrome");
  const browserHostDescriptorPath = takeOption(args, "--browser-host-descriptor");
  if (chrome) options.chromeExecutablePath = chrome;
  if (browserHostDescriptorPath) options.browserHostDescriptorPath = browserHostDescriptorPath;
  options.refreshAccountCapabilities = takeFlag(args, "--refresh-account-capabilities");
  if (appName) options.appName = appName;
  if (tunnelId) options.tunnelId = tunnelId;
  if (runtimeKeyFile) options.runtimeKeyFile = runtimeKeyFile;
  options.forceLogin = takeFlag(args, "--login");
  options.autoApproveToolCalls = takeFlag(args, "--auto-approve-tool-calls");
  const biggerContext = takeFlag(args, "--bigger-context");
  const standardContext = takeFlag(args, "--standard-context");
  if (biggerContext && standardContext) {
    throw new Error("Choose at most one context mode: --bigger-context or --standard-context");
  }
  if (biggerContext || standardContext) options.experimentalBiggerContext = biggerContext;
  const zeroRiskPro = takeFlag(args, "--zero-risk-pro");
  const zeroRiskDefault = takeFlag(args, "--zero-risk-default");
  if (zeroRiskPro && zeroRiskDefault) {
    throw new Error("Choose at most one Zero Risk model profile: --zero-risk-pro or --zero-risk-default");
  }
  if (zeroRiskPro || zeroRiskDefault) options.zeroRiskProEnabled = zeroRiskPro;
  options.replaceCodexRoute = takeFlag(args, "--replace-codex-route");
  options.restartService = takeFlag(args, "--restart-service");
  assertNoArgs(args);

  if (!acknowledged) {
    stdout.write(
      "This is independent, unofficial software. It automates your ChatGPT web session, can break when the UI changes, "
      + "and must not be used to evade usage limits or access controls.\n",
    );
    acknowledged = await confirm("Continue and store this acknowledgement?");
  }
  if (!acknowledged) throw new Error("Setup cancelled: acknowledgement was not provided");
  options.acknowledgedUnofficial = true;

  if (preflightOnly) {
    preflightSetup(options);
    stdout.write("Setup preflight complete.\n");
    return;
  }

  const existing = existsSync(getConfigPath()) ? loadConfigForSetup() : undefined;
  const interactionMode = options.browserInteractionMode ?? existing?.browserInteractionMode ?? "automatic";
  const reusableCredentials = existingFullSetupCredentials(existing, interactionMode);
  const needsTunnelId = !options.tunnelId && !reusableCredentials.tunnelId;
  const needsRuntimeKey = !options.runtimeKeyFile
    && !reusableCredentials.runtimeKey
    && !existsSync(managedRuntimeKeyPath(interactionMode));

  if (full && (needsTunnelId || needsRuntimeKey) && stdin.isTTY) {
    stdout.write("Full mode needs an OpenAI tunnel and a runtime key with Tunnels Read + Use.\n");
    stdout.write("Tunnels: https://platform.openai.com/settings/organization/tunnels\n");
    stdout.write("Runtime keys: https://platform.openai.com/settings/organization/api-keys\n");
    if (needsTunnelId) options.tunnelId = await prompt("Tunnel id: ");
    if (needsRuntimeKey) {
      options.runtimeKeyValue = await secretPrompt("Runtime key (hidden): ");
    }
  }

  const result = await setup(options);
  stdout.write(`Setup complete: ${result.mode}\n`);
  stdout.write(`Config: ${result.configPath}\n`);
  if (result.connectorSetupRequired) {
    stdout.write("One account-level step remains: attach the tunnel to the ChatGPT connector named in config.\n");
    stdout.write("Open: https://chatgpt.com/#settings/Plugins\n");
  }
  stdout.write("Restart the Codex app once so its native model catalog refreshes through the installed route.\n");
}

async function doctorCommand(args: string[]): Promise<void> {
  const json = takeFlag(args, "--json");
  assertNoArgs(args);
  const report = await runDoctor();
  stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : formatDoctorReport(report));
  if (!report.ok) process.exitCode = 1;
}

async function routeCommand(args: string[]): Promise<void> {
  const action = args.shift() ?? "status";
  assertNoArgs(args);
  if (action === "client-status") {
    stdout.write(`${JSON.stringify(await readCatalogStatus(loadConfig()), null, 2)}\n`);
    return;
  }
  const result = action === "status"
    ? (() => {
        const status = inspectCodexIntegration();
        return {
          installed: status.installed,
          active: status.active,
          ...(status.routeUrl ? { routeUrl: status.routeUrl } : {}),
          errors: status.errors,
        };
      })()
    : action === "connect"
      ? activateCodexIntegration()
      : action === "disconnect"
        ? deactivateCodexIntegration()
        : undefined;
  if (!result) throw new Error(`Unknown route action: ${action}`);
  stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function subagentsCommand(args: string[]): Promise<void> {
  const action = args.shift() ?? "status";
  assertNoArgs(args);
  const config = loadConfig();
  if (config.purpose === "dev-harness") {
    throw new Error("The isolated DEV harness has no Codex subagent protocol to configure");
  }
  if (action === "status") {
    const integration = inspectCodexIntegration();
    stdout.write(`${JSON.stringify({
      protocol: readCodexSubagentProtocol(config.subagentProtocol),
      installed: integration.installed,
      active: integration.active,
    }, null, 2)}\n`);
    return;
  }
  if (action !== "compatibility-v1" && action !== "native") {
    throw new Error("Subagent protocol must be one of: status, compatibility-v1, native");
  }
  const journal = setCodexSubagentProtocol(config, action);
  stdout.write(`${JSON.stringify({
    protocol: journal.installed.subagent_protocol,
    codexRestartRequired: true,
    launcherRestartRequired: true,
  }, null, 2)}\n`);
}

async function serviceCommand(args: string[]): Promise<void> {
  const action = args.shift() ?? "status";
  assertNoArgs(args);
  const config = action === "status" ? undefined : loadConfig();
  if (action === "cancel-turns") {
    stdout.write(`${JSON.stringify(await cancelActiveTurns(config!), null, 2)}\n`);
    return;
  }
  const status = action === "status" ? getServiceStatus()
    : action === "install" ? installService(config!)
      : action === "start" ? startService()
        : action === "restart" ? await restartService(config!)
          : action === "stop" ? await stopService(config!)
            : undefined;
  if (!status) throw new Error(`Unknown service action: ${action}`);
  stdout.write(`${JSON.stringify(status, null, 2)}\n`);
}

async function interruptHookCommand(args: string[]): Promise<void> {
  assertNoArgs(args);
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > 32 * 1024) throw new Error("Codex Interrupt hook payload is too large");
    chunks.push(buffer);
  }
  let payload: { hook_event_name?: unknown; session_id?: unknown; turn_id?: unknown };
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Codex Interrupt hook payload is not valid JSON");
  }
  const threadId = typeof payload.session_id === "string" ? payload.session_id.trim() : "";
  const turnId = typeof payload.turn_id === "string" ? payload.turn_id.trim() : "";
  if (payload.hook_event_name !== "Interrupt"
    || !/^[A-Za-z0-9_-]{6,128}$/.test(threadId)
    || !/^[A-Za-z0-9_-]{6,128}$/.test(turnId)) {
    throw new Error("Codex Interrupt hook payload has no valid session_id or turn_id");
  }
  await interruptActiveTurn(loadConfig(), { threadId, turnId });
}

async function tunnelCommand(args: string[]): Promise<void> {
  const action = args.shift() ?? "status";
  assertNoArgs(args);
  if (action === "key-import") {
    const key = await secretPrompt("Runtime key (hidden): ");
    if (!key) throw new Error("A non-empty runtime key is required");
    installRuntimeKeyBytes(key);
    stdout.write(`Runtime key stored privately at ${managedRuntimeKeyPath()}\n`);
    return;
  }
  const config = loadConfig();
  if (action === "start") startTunnelService();
  else if (action === "restart") {
    await assertServiceIdle(config);
    await restartTunnelService();
  }
  else if (action === "stop") {
    await assertServiceIdle(config);
    await stopTunnelService();
    stopTunnel(config);
  }
  else if (action !== "status") throw new Error(`Unknown tunnel action: ${action}`);
  const status = action === "start" || action === "restart"
    ? await waitForTunnelReady(config)
    : tunnelStatus(config);
  const service = getTunnelServiceStatus();
  stdout.write(`${JSON.stringify({ service, runtime: status }, null, 2)}\n`);
  if (action !== "stop" && (!service.running || !status.ok)) process.exitCode = 1;
}

async function cockpitCommand(args: string[]): Promise<void> {
  const action = args.shift() ?? "status";
  if (action === "status") {
    assertNoArgs(args);
    const profile = readStoredCockpitProfile();
    stdout.write(JSON.stringify(profile ? {
      configured: true,
      enabled: profile.cockpit.enabled,
      baseUrl: profile.cockpit.baseUrl,
      models: profile.cockpit.models,
      accounts: profile.cockpit.accounts?.map(account => ({ id: account.id, label: account.label, provider: account.provider, enabled: account.enabled, health: account.health, priority: account.priority, models: account.models })),
      routes: profile.cockpit.routes?.map(route => ({ id: route.id, namespace: route.namespace, provider: route.provider, accountIds: route.accountIds, models: route.models, strict: route.strict })),
      keyFile: profile.cockpit.apiKeyFile ? "configured" : "inline-key",
      clientKey: profile.cockpit.clientApiKeyFile || profile.cockpit.clientApiKey ? "configured" : "missing",
      rollback: existsSync(cockpitProfileBackupPath()) ? "available" : "unavailable",
      evidencePath: profile.cockpit.evidencePath ?? null,
      evidence: summarizeCockpitEvidence(readCockpitEvidence(profile.cockpit.evidencePath, 500)),
      profilePath: cockpitProfilePath(),
      updatedAt: profile.updatedAt,
    } : { configured: false, profilePath: cockpitProfilePath() }, null, 2) + "\n");
    return;
  }
  if (action === "configure") {
    const baseUrl = takeOption(args, "--base-url");
    const keyFile = takeOption(args, "--api-key-file");
    const models = takeOption(args, "--models");
    const routingFile = takeOption(args, "--routing-file");
    const disabled = takeFlag(args, "--disabled");
    assertNoArgs(args);
    if (!baseUrl || !keyFile || !isAbsolute(keyFile)) {
      throw new Error("cockpit configure requires --base-url and an absolute --api-key-file");
    }
    let routing: Record<string, unknown> = {};
    if (routingFile !== undefined) {
      if (!isAbsolute(routingFile) || !existsSync(routingFile) || statSync(routingFile).size > 256 * 1024) throw new Error("--routing-file must be an existing bounded absolute file");
      const mode = statSync(routingFile).mode;
      if (process.platform !== "win32" && (mode & 0o077)) throw new Error("--routing-file must be owner-only (0600)");
      const parsed = JSON.parse(readFileSync(routingFile, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("--routing-file must contain a JSON object");
      const candidate = parsed as Record<string, unknown>;
      routing = {
        ...(candidate.accounts === undefined ? {} : { accounts: candidate.accounts }),
        ...(candidate.routes === undefined ? {} : { routes: candidate.routes }),
        ...(candidate.sessionAffinity === undefined ? {} : { sessionAffinity: candidate.sessionAffinity }),
      };
    }
    const profile = saveStoredCockpitProfile(validateCockpitConfig({
      enabled: !disabled,
      baseUrl,
      apiKeyFile: keyFile,
      models: models ? models.split(",").map(item => item.trim()).filter(Boolean) : [],
      ...routing,
    }));
    stdout.write(JSON.stringify({ configured: true, enabled: profile.cockpit.enabled, profilePath: cockpitProfilePath(), models: profile.cockpit.models }, null, 2) + "\n");
    return;
  }
  if (action === "probe") {
    assertNoArgs(args);
    const profile = readStoredCockpitProfile();
    if (!profile) throw new Error("Cockpit is not configured; run cockpit configure first");
    const result = await probeCockpitModels(profile.cockpit);
    if (result.ok && result.models.length > 0) {
      saveStoredCockpitProfile({ ...profile.cockpit, models: result.models });
    }
    stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === "client-key") {
    assertNoArgs(args);
    const profile = readStoredCockpitProfile();
    if (!profile) throw new Error("Cockpit is not configured; run cockpit configure first");
    const key = readCockpitClientApiKey(profile.cockpit);
    if (!key) throw new Error("Cockpit client key is missing");
    stdout.write(`${key}\n`);
    return;
  }
  if (action === "rollback") {
    assertNoArgs(args);
    const profile = rollbackStoredCockpitProfile();
    stdout.write(JSON.stringify({ rolledBack: true, enabled: profile.cockpit.enabled, profilePath: cockpitProfilePath(), models: profile.cockpit.models }, null, 2) + "\n");
    return;
  }
  if (action === "evidence") {
    const limitRaw = takeOption(args, "--limit");
    assertNoArgs(args);
    const profile = readStoredCockpitProfile();
    if (!profile) throw new Error("Cockpit is not configured; run cockpit configure first");
    const limit = limitRaw === undefined ? 100 : Number(limitRaw);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error("--limit must be an integer from 1 to 500");
    stdout.write(JSON.stringify({ path: profile.cockpit.evidencePath ?? null, records: readCockpitEvidence(profile.cockpit.evidencePath, limit) }, null, 2) + "\n");
    return;
  }
  if (action === "clear") {
    const yes = takeFlag(args, "--yes");
    assertNoArgs(args);
    if (!yes && !await confirm("Remove the private Cockpit profile?")) throw new Error("Cockpit profile removal cancelled");
    removeStoredCockpitProfile();
    stdout.write("Cockpit profile removed.\n");
    return;
  }
  throw new Error(`Unknown Cockpit action: ${action}`);
}

async function openCommand(args: string[]): Promise<void> {
  const target = args.shift();
  assertNoArgs(args);
  const urls: Record<string, string> = {
    tunnels: "https://platform.openai.com/settings/organization/tunnels",
    "runtime-keys": "https://platform.openai.com/settings/organization/api-keys",
    connectors: "https://chatgpt.com/#settings/Plugins",
  };
  const url = target ? urls[target] : undefined;
  if (!url) throw new Error("Choose one of: tunnels, runtime-keys, connectors");
  if (process.platform === "darwin") {
    const result = runCommand("open", [url]);
    if (result.status !== 0) throw new Error(result.stderr.trim() || `Could not open ${url}`);
  } else {
    stdout.write(`${url}\n`);
  }
}

async function uninstallCommand(args: string[]): Promise<void> {
  const yes = takeFlag(args, "--yes");
  const keepData = takeFlag(args, "--keep-data");
  const launcherControl = takeFlag(args, "--launcher-control");
  assertNoArgs(args);
  if (launcherControl) authorizeLauncherControl("uninstall");
  if (!yes && !await confirm("Restore Codex config, stop services, and remove this installation?")) {
    throw new Error("Uninstall cancelled");
  }
  const config = existsSync(getConfigPath()) ? loadConfig() : undefined;
  if (config?.browserHost === "launcher" && !launcherControl) {
    throw new Error(
      "Launcher-owned integration must be removed from Codex Web GPT Settings so the active runtime can be drained safely.",
    );
  }
  if (!config && process.platform === "darwin" && getServiceStatus().installed) {
    throw new Error("Service exists but configuration is missing; refusing an unverifiable uninstall");
  }
  const launcherRuntimeStopped = config?.browserHost === "launcher" && launcherControl;
  if (config && process.platform === "darwin" && !launcherRuntimeStopped) await assertServiceIdle(config);
  if (config?.mode === "full" && !launcherRuntimeStopped) {
    if (process.platform === "darwin") await uninstallTunnelService();
    stopTunnel(config);
  }
  if (config && process.platform === "darwin" && !launcherRuntimeStopped) await uninstallService(config);
  uninstallCodexIntegration();
  if (!keepData) rmSync(getConfigDir(), { recursive: true, force: true });
  stdout.write(keepData ? "Uninstalled; private application data was preserved.\n" : "Uninstalled and removed private application data.\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const home = takeOption(args, "--home");
  if (home) process.env.CODEX_CHATGPT_WEB_HOME = home;
  if (takeFlag(args, "--help") || takeFlag(args, "-h")) {
    stdout.write(HELP);
    return;
  }
  if (takeFlag(args, "--version") || takeFlag(args, "-v")) {
    stdout.write(`${VERSION}\n`);
    return;
  }
  const command = args.shift() ?? "help";
  if (command === "dev" && home) {
    throw new Error("--home does not apply to DEV mode; use CODEX_WEB_GPT_DEV_HOME for an explicit isolated DEV profile");
  }
  if (command === "help") stdout.write(HELP);
  else if (command === "setup") await setupCommand(args);
  else if (command === "login") await loginCommand(args);
  else if (command === "doctor" || command === "status") await doctorCommand(args);
  else if (command === "route") await routeCommand(args);
  else if (command === "copy-catalog") {
    const template = args.shift();
    const targetConfig = args.shift();
    assertNoArgs(args);
    if (!template || !isAbsolute(template) || !targetConfig || !isAbsolute(targetConfig) || statSync(template).size > 8 * 1024 * 1024) throw new Error("SM_COPY_INVALID_TEMPLATE");
    const config = loadConfig();
    const catalog = augmentNativeModelCatalog(JSON.parse(readFileSync(template, "utf8")), config);
    catalog.models = (catalog.models as Array<{ slug?: string }>).filter(model => model.slug?.startsWith("chatgpt-web/"));
    stdout.write(JSON.stringify({ catalog, endpoint: `http://${config.host}:${config.port}/v1`, interruptHook: installCodexInterruptHook("", targetConfig, config).text }) + "\n");
  }
  else if (command === "subagents") await subagentsCommand(args);
  else if (command === "browser") {
    const action = args.shift();
    assertNoArgs(args);
    if (action !== "check") throw new Error("Browser command must be: browser check");
    const config = loadConfig();
    if (config.browserHost === "launcher") {
      if (config.browserInteractionMode === "manual") {
        await inspectLauncherBrowserHostLiveness(config.browserHostDescriptorPath!);
        stdout.write("The launcher browser is reachable; ChatGPT DOM inspection is intentionally disabled in Zero Risk.\n");
      } else {
        await inspectLauncherBrowserHost(config.browserHostDescriptorPath!);
        stdout.write("Playwright can reach the authenticated ChatGPT surface embedded in the launcher.\n");
      }
    } else {
      await checkBrowserEngine(config);
      stdout.write("Playwright can launch the configured Chrome executable.\n");
    }
  } else if (command === "serve") {
    assertNoArgs(args);
    const config = loadConfig();
    const server = startServer(config);
    stdout.write(`codex-chatgpt-web ${VERSION} listening on http://${config.host}:${server.port}/v1 (${config.mode})\n`);
    await new Promise<void>(() => {});
  } else if (command === "dev") await runDevCommand(args);
  else if (command === "mcp") await runChatGptMcpMain(args);
  else if (command === "service") await serviceCommand(args);
  else if (command === "hook") {
    const action = args.shift();
    if (action !== "interrupt") throw new Error("Hook command must be: hook interrupt");
    await interruptHookCommand(args);
  }
  else if (command === "tunnel") await tunnelCommand(args);
  else if (command === "cockpit") await cockpitCommand(args);
  else if (command === "open") await openCommand(args);
  else if (command === "uninstall") await uninstallCommand(args);
  else throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

main().catch(error => {
  process.stderr.write(`codex-chatgpt-web: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
