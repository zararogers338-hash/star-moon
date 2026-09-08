export type Language = "en" | "zh-CN" | "zh-Hant" | "ja" | "fr" | "ru" | "de";
export type MoonTheme = "light" | "dark";
export type LauncherProfile = "production" | "development";
export type BrowserInteractionMode = "automatic" | "manual";
export type Surface = "connection" | "browser" | "setup" | "mcp" | "activity" | "settings";

export interface LauncherState {
  version: 1;
  language: Language | null;
  theme?: MoonTheme;
  onboardingComplete: boolean;
  guidedSetupComplete?: boolean;
  guidedSetupPaused?: boolean;
  guidedSetupResumeStage?: string;
  githubOpened: boolean;
  xOpened: boolean;
  autoStart: boolean;
  keepRunningOnClose: boolean;
  showBrowserDuringTurns: boolean;
  browserVisible?: boolean;
  browserZoomFactor?: number;
  browserInteractionMode: BrowserInteractionMode;
  experimentalBiggerContext: boolean;
  zeroRiskProEnabled: boolean;
  sidebarOpen: boolean;
  sidebarWidth: number;
  browserSmokePassed?: boolean;
  browserSmokeVersion?: string | null;
  coreSetupComplete?: boolean;
  codexCatalogVerified?: boolean;
  mcpSetupComplete?: boolean;
  mcpRuntimeInstalled?: boolean;
  codexRestartRequired?: boolean;
  catalogCheckDeferred?: boolean;
  mcpGuideStep: number;
  sessionRefreshReminderAt: string | null;
}

export interface BrowserState {
  status: "idle" | "loading" | "signed-out" | "ready" | "testing" | "running" | "error";
  message: string;
  url: string;
  title: string;
  authenticated: boolean;
  visible: boolean;
  surfaceActive: boolean;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  zoomFactor: number;
  activeTabId: string;
  maxTabs: number;
  tabs: BrowserTabState[];
}

export interface BrowserTabState {
  id: string;
  traceId: string | null;
  title: string;
  status: "idle" | "loading" | "signed-out" | "ready" | "testing" | "running" | "error" | "aborted";
  loading: boolean;
  active: boolean;
  closable: boolean;
  interactionMode?: BrowserInteractionMode;
  manualState?: "awaiting-user" | "sent" | "running" | "completed" | "timed-out" | "cancelled" | "failed";
  manualDeadlineAt?: string;
  canCopyPrompt?: boolean;
  canConfirmSent?: boolean;
}

export interface LogRecord {
  at: string;
  level: "debug" | "info" | "warning" | "error";
  event: string;
  detail: Record<string, unknown>;
}

export interface DoctorCheck {
  id: string;
  status: "ok" | "warning" | "error";
  message: string;
  detail?: string;
}

export interface DoctorReport {
  ok: boolean;
  mode?: "browser-only" | "full";
  checks: DoctorCheck[];
}

export interface CatalogStatus {
  version: 1;
  state: "blocked" | "proxy-unavailable" | "observed" | "authentication-required" | "request-failed" | "waiting-client";
  routing: { scope: "user-config-on-disk"; compatible: boolean; provider: string; issues: string[] };
  healthy: boolean;
  requests: number;
  lastStatus: number | null;
  port: number;
  checkedAt: string;
}

export interface OperationState {
  name: string;
  status: "running" | "completed" | "failed";
  message: string;
}

export type UpdateState =
  | { status: "disabled" | "idle" | "checking" | "up-to-date" }
  | { status: "available" | "downloading" | "installing"; version: string }
  | { status: "error"; message: string };

export interface LauncherSnapshot {
  profile: LauncherProfile;
  profilePaths: {
    coreHome: string;
    codexHome: string;
    userData: string;
  };
  state: LauncherState;
  browser: BrowserState | null;
  connectorName: string;
  connectorNames: Record<BrowserInteractionMode, string>;
  mcpCredentialsConfigured: boolean;
  logs: LogRecord[];
  urls: {
    github: string | null;
    connectors: string;
    tunnels: string;
    keys: string;
    companionExtension?: string;
    companionRepository?: string;
  };
  platform: string;
  packaged: boolean;
  version: string;
  smokePassed: boolean;
  operation: OperationState | null;
  update: UpdateState;
}

export interface LauncherApi {
  cockpitStatus(): Promise<{ configured: boolean; enabled?: boolean; baseUrl?: string; models?: string[]; accounts?: Array<{ id: string; label: string; provider: "gpt" | "claude"; enabled: boolean; health: string; priority: number; models: string[] }>; routes?: Array<{ id: string; namespace: string; provider: "gpt" | "claude"; accountIds: string[]; models: string[]; strict: boolean }>; keyFile?: string; clientKey?: string; rollback?: "available" | "unavailable"; evidencePath?: string | null; evidence?: { gate: "missing" | "observed" | "verified" | "failed"; total: number; completedRequests: number; failedRequests: number; cancelledRequests: number; lastProvider?: string | null; lastRouteId?: string | null; lastModel?: string | null }; profilePath?: string; updatedAt?: string }>;
  cockpitConfigure(input: { baseUrl: string; apiKeyFile: string; models: string[]; disabled?: boolean }): Promise<unknown>;
  cockpitProbe(): Promise<{ ok: boolean; status: number | null; models: string[]; checkedAt: string; detail?: string }>;
  cockpitRollback(): Promise<unknown>;
  cockpitEvidence(limit?: number): Promise<{ path: string | null; records: Array<{ endpoint: string; status: number | null; ok: boolean; outcome: string; durationMs: number; bytes?: number; model?: string; detail?: string; observedAt?: string }> }>;
  cockpitKeyFile(): Promise<string | null>;
  cockpitClientKeyCopy(): Promise<boolean>;
  codexCopies(): Promise<{ runtime: { codexExecutable: string | null; desktopExecutable: string | null }; copies: CodexCopy[] }>;
  createCodexCopy(input: { name: string; mode: "native" | "web" }): Promise<CodexCopy>;
  inspectCodexCopy(id: string): Promise<CodexCopy>;
  openCodexCopy(id: string): Promise<CodexCopy>;
  archiveCodexCopy(id: string, archived: boolean): Promise<CodexCopy>;
  openCodexCopyFolder(id: string): Promise<string>;
  startCodexCopyLogin(id: string): Promise<CodexCopyLoginState>;
  verifyCodexCopyLogin(id: string): Promise<CodexCopyLoginState>;
  codexCopyLoginStatus(): Promise<CodexCopyLoginState>;
  cancelCodexCopyLogin(): Promise<CodexCopyLoginState>;
  setCodexCopyLoginBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<boolean>;
  onCodexCopyLoginChanged(listener: (state: CodexCopyLoginState) => void): () => void;
  agentDockRead(): Promise<AgentDockConnection>;
  agentDockConfigure(input: { url: string; publicUrl?: string }): Promise<AgentDockConnection>;
  agentDockInspect(): Promise<AgentDockConnection>;
  agentDockLogin(): Promise<AgentDockConnection>;
  openAgentDockWebSetup(): Promise<BrowserState>;
  onAgentDockChanged(listener: (connection: AgentDockConnection) => void): () => void;
  createMoonLetter(consent: boolean): Promise<MoonLetterInfo>;
  moonLetterStatus(): Promise<Record<string, boolean | string>>;
  openMoonLetterControl(): Promise<boolean>;
  stopMoonLetter(): Promise<boolean>;
  snapshot(): Promise<LauncherSnapshot>;
  setLanguage(language: Language): Promise<LauncherState>;
  setTheme(theme: MoonTheme): Promise<LauncherState>;
  completeOnboarding(language: Language, browserInteractionMode: BrowserInteractionMode): Promise<LauncherState>;
  reopenOnboarding(): Promise<LauncherState>;
  openExternal(url: string): Promise<boolean>;
  setBrowserBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<boolean>;
  setBrowserSurfaceActive(active: boolean): Promise<BrowserState>;
  showBrowser(): Promise<BrowserState>;
  hideBrowser(): Promise<BrowserState>;
  navigateBrowser(action: "back" | "forward" | "reload"): Promise<BrowserState>;
  zoomBrowser(action: "in" | "out" | "reset"): Promise<BrowserState>;
  selectBrowserTab(tabId: string): Promise<BrowserState>;
  closeBrowserTab(tabId: string): Promise<BrowserState>;
  copyManualPrompt(tabId: string): Promise<BrowserState>;
  confirmManualSent(tabId: string): Promise<BrowserState>;
  openLogin(): Promise<BrowserState>;
  cancelLogin(): Promise<BrowserState>;
  reloadLogin(): Promise<BrowserState>;
  openPasskeyLogin(): Promise<BrowserState>;
  continuePasskeyLogin(): Promise<boolean>;
  cancelPasskeyLogin(): Promise<boolean>;
  pauseGuidedSetup(stage: string): Promise<LauncherState>;
  resumeGuidedSetup(): Promise<LauncherState>;
  rememberGuidedSetupPage(stage: string): Promise<boolean>;
  quitLauncher(): Promise<{ ok: boolean; message?: string }>;
  logoutChatGpt(): Promise<{ browser: BrowserState; state: LauncherState }>;
  dismissSessionReminder(): Promise<LauncherState>;
  smokeTest(): Promise<{ ok: boolean; effort: string; response: string }>;
  verifyMcp(): Promise<DoctorReport>;
  doctor(): Promise<DoctorReport>;
  catalogStatus(): Promise<CatalogStatus>;
  deferCatalogCheck(): Promise<LauncherState>;
  finishGuidedSetup(): Promise<LauncherState>;
  cancelTurns(): Promise<{ stdout: string }>;
  uninstallIntegration(): Promise<{ cancelled: true } | { cancelled: false; state: LauncherState }>;
  setupCore(): Promise<{ ok: boolean; stdout: string; restartRequired: boolean }>;
  setupMcp(input: {
    tunnelId?: string;
    runtimeKey?: string;
    replace?: boolean;
    interactionMode?: BrowserInteractionMode;
  }): Promise<{ ok: boolean; stdout: string }>;
  setMcpStep(step: number): Promise<LauncherState>;
  setAutostart(enabled: boolean): Promise<{ state: LauncherState; supported: boolean; enabled: boolean }>;
  setBiggerContext(enabled: boolean): Promise<LauncherState>;
  setZeroRiskPro(enabled: boolean): Promise<LauncherState>;
  setBrowserInteractionMode(mode: BrowserInteractionMode): Promise<{
    state: LauncherState;
    credentialsRequired: boolean;
    targetMode: BrowserInteractionMode;
  }>;
  setPreference(
    key: "keepRunningOnClose" | "showBrowserDuringTurns",
    value: boolean,
  ): Promise<LauncherState>;
  setSidebarState(state: { open: boolean; width: number }): Promise<LauncherState>;
  logs(limit?: number): Promise<LogRecord[]>;
  exportLogs(): Promise<string | null>;
  openDevTools(): Promise<void>;
  installUpdate(): Promise<boolean>;
  windowState(): Promise<{ fullScreen: boolean; maximized: boolean }>;
  windowControl(action: "close" | "minimize" | "zoom"): void;
  onWindowStateChanged(listener: (state: { fullScreen: boolean; maximized: boolean }) => void): () => void;
  onStateChanged(listener: (state: LauncherState) => void): () => void;
  onBrowserState(listener: (state: BrowserState) => void): () => void;
  onOperation(listener: (state: OperationState) => void): () => void;
  onLog(listener: (record: LogRecord) => void): () => void;
  onUpdateState(listener: (state: UpdateState) => void): () => void;
}

export interface CodexCopy {
  id: string;
  name: string;
  mode: "native" | "web";
  archived: boolean;
  createdAt: string;
  home: string;
  desktopData: string;
  cliLauncher: string;
  codexVersion: string;
  desktopAvailable: boolean;
  status: "created" | "running" | "needs-attention";
  issues: string[];
  pid: number | null;
  login?: "chatgpt" | "api-key" | "not-verified" | "not-logged-in";
  verification: { kind: "local-catalog-loaded"; at: string; modelCalls: number; credentialsCopied: boolean } | null;
}

export interface CodexCopyLoginState {
  state: "idle" | "preparing" | "waiting-user" | "verifying" | "complete" | "cancelled" | "failed";
  copyId: string | null;
  name: string;
  origin: string;
  pageLoaded: boolean;
  error?: string | null;
}

export interface AgentDockConnection {
  url: string;
  publicUrl: string;
  state: string;
  authenticated: boolean;
  tools: string[];
  serverName?: string | null;
  serverVersion?: string | null;
  checkedAt?: number;
}

export interface MoonLetterInfo { text: string; path: string; controlUrl: string; expiresAt: number; preview?: boolean; }

declare global {
  interface Window {
    codexWebLauncher?: LauncherApi;
  }
}
