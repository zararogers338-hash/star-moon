// Explicitly simulated; no native IPC, credentials, network or process launch.
import { createRoot } from "react-dom/client";
import { CodexCopiesPanel } from "../src/CodexCopies";
import type { CodexCopy, Language, LauncherApi } from "../src/types";
import "../src/tokens.css";
import "../src/styles.css";
const query = new URLSearchParams(location.search);
let items: CodexCopy[] = [], operations = 0;
const mark = () => { document.getElementById("ops")!.textContent = `MOCK OPERATIONS: ${++operations} / REAL OPERATIONS: 0`; };
const update = (id: string, patch: Partial<CodexCopy>) => { mark(); items = items.map(item => item.id === id ? { ...item, ...patch } : item); return items.find(item => item.id === id)!; };
const api = {
  codexCopies: async () => ({ runtime: { codexExecutable: "/simulation/codex", desktopExecutable: "/simulation/Codex" }, copies: items }),
  createCodexCopy: async ({ name, mode }: { name: string; mode: "web" | "native" }) => {
    mark(); await new Promise(resolve => setTimeout(resolve, 300));
    if (query.has("fail")) throw new Error("SM_COPY_CREATE_FAILED");
    const copy = { id: crypto.randomUUID(), name, mode, archived: false, createdAt: "2026-09-06T00:00:00Z", home: "/simulation/独立副本/home", desktopData: "/simulation/独立副本/desktop", cliLauncher: "/simulation/start-cli.command", codexVersion: "SIMULATED", desktopAvailable: true, status: "created", issues: [], verification: { kind: "local-catalog-loaded", at: "2026-09-06T00:00:00Z", modelCalls: 0, credentialsCopied: false }, pid: null } as CodexCopy;
    items.push(copy); return copy;
  },
  inspectCodexCopy: async (id: string) => { mark(); return items.find(item => item.id === id)!; },
  openCodexCopy: async (id: string) => update(id, { status: "running", pid: 12345 }),
  archiveCodexCopy: async (id: string, archived: boolean) => update(id, { archived }),
  openCodexCopyFolder: async () => { mark(); return ""; },
} as LauncherApi;
createRoot(document.getElementById("root")!).render(<div data-theme="dark" style={{ minHeight: "100vh", padding: "20px", background: "#23253d", color: "#f7f4ef" }}>
  <p>SIMULATED UI — NO FILES / NO ACCOUNTS / NO PROCESSES</p><p id="ops">MOCK OPERATIONS: 0 / REAL OPERATIONS: 0</p>
  <div style={{ maxWidth: 720, margin: "auto" }}><CodexCopiesPanel api={api} language={(query.get("lang") || "zh-CN") as Language} /></div>
</div>);
