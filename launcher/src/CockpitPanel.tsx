import { useEffect, useState } from "react";
import type { Language, LauncherApi } from "./types";
import "./cockpit-panel.css";

const copy = {
  en: {
    title: "Cockpit reverse proxy", body: "Use an explicit local or HTTPS Cockpit gateway. Star Moon never imports its browser cookies or account files.",
    baseUrl: "Cockpit Base URL", keyFile: "Upstream API key file", chooseFile: "Choose file", models: "Models (comma separated)", savedModels: "Configured models", save: "Save configuration", probe: "Probe models", rollback: "Rollback previous config", evidence: "Read evidence", copyKey: "Copy Star Moon client key", configured: "Configured", notConfigured: "Not configured", ready: "Models verified", failed: "Probe failed", empty: "No verified models yet",
  },
  "zh-CN": {
    title: "Cockpit 反向代理", body: "使用明确的本机或 HTTPS Cockpit 网关。星月不会导入 Cockpit 的浏览器 Cookie 或账号文件。",
    baseUrl: "Cockpit Base URL", keyFile: "上游 API Key 文件", chooseFile: "选择文件", models: "模型（逗号分隔）", savedModels: "已配置模型", save: "保存配置", probe: "探测模型", rollback: "回滚上一份配置", evidence: "读取证据", copyKey: "复制星月客户端 Key", configured: "已配置", notConfigured: "未配置", ready: "模型已验证", failed: "探测失败", empty: "还没有已验证模型",
  },
} as const;

export function CockpitPanel({ api, language, disabled = false, setError }: {
  api: LauncherApi;
  language: Language;
  disabled?: boolean;
  setError: (message: string | null) => void;
}) {
  const words = copy[language === "zh-CN" ? "zh-CN" : "en"];
  const [status, setStatus] = useState<Awaited<ReturnType<LauncherApi["cockpitStatus"]>> | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [keyFile, setKeyFile] = useState("");
  const [models, setModels] = useState("");
  const [probe, setProbe] = useState<Awaited<ReturnType<LauncherApi["cockpitProbe"]>> | null>(null);
  const [evidenceCount, setEvidenceCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const next = await api.cockpitStatus();
    setStatus(next);
    if (next.baseUrl) setBaseUrl(next.baseUrl);
    if (next.models) setModels(next.models.join(","));
  };
  useEffect(() => { void refresh().catch(error => setError(error instanceof Error ? error.message : String(error))); }, []);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      await api.cockpitConfigure({ baseUrl: baseUrl.trim(), apiKeyFile: keyFile.trim(), models: models.split(",").map(item => item.trim()).filter(Boolean) });
      await refresh();
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const runProbe = async () => {
    setBusy(true); setError(null);
    try { const next = await api.cockpitProbe(); setProbe(next); if (next.models.length) setModels(next.models.join(",")); await refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const rollback = async () => {
    setBusy(true); setError(null);
    try { await api.cockpitRollback(); await refresh(); setProbe(null); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const loadEvidence = async () => {
    setBusy(true); setError(null);
    try { const result = await api.cockpitEvidence(100); setEvidenceCount(result.records.length); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const copyClientKey = async () => {
    setBusy(true); setError(null);
    try { await api.cockpitClientKeyCopy(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const chooseFile = async () => {
    try { const selected = await api.cockpitKeyFile(); if (selected) setKeyFile(selected); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
  };
  const evidenceLabel = status?.evidence
    ? [
      `evidence:${status.evidence.gate}`,
      `${status.evidence.completedRequests} completed`,
      status.evidence.lastProvider ? `route:${status.evidence.lastRouteId ?? "default"} / ${status.evidence.lastProvider}${status.evidence.lastModel ? ` / ${status.evidence.lastModel}` : ""}` : null,
    ].filter(Boolean).join(" · ")
    : status?.models?.length ? `${words.savedModels} · ${status.models.length}` : words.empty;

  return <section className="cockpit-panel" aria-label={words.title}>
    <header><div><span className="cockpit-panel-kicker">虚假之天 / COCKPIT</span><h2>{words.title}</h2><p>{words.body}</p></div><span className={`cockpit-panel-state ${status?.configured ? "is-ready" : ""}`}>{status?.configured ? words.configured : words.notConfigured}</span></header>
    <div className="cockpit-panel-fields">
      <label><span>{words.baseUrl}</span><input value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="http://127.0.0.1:42421/v1" disabled={disabled || busy}/></label>
      <label><span>{words.keyFile}</span><input value={keyFile} onChange={event => setKeyFile(event.target.value)} placeholder="/path/to/cockpit-key" disabled={disabled || busy}/><button type="button" className="text-button" onClick={() => void chooseFile()} disabled={disabled || busy}>{words.chooseFile}</button></label>
      <label><span>{words.models}</span><input value={models} onChange={event => setModels(event.target.value)} placeholder="gpt-5.6-sol, any/claude-opus" disabled={disabled || busy}/></label>
    </div>
    <div className="cockpit-panel-actions">
      <button type="button" className="button-primary" onClick={() => void save()} disabled={disabled || busy || !baseUrl.trim() || !keyFile.trim()}>{words.save}</button>
      <button type="button" className="button-secondary" onClick={() => void runProbe()} disabled={disabled || busy || !status?.configured}>{words.probe}</button>
      <button type="button" className="button-secondary" onClick={() => void rollback()} disabled={disabled || busy || !status?.configured || status.rollback !== "available"}>{words.rollback}</button>
      <button type="button" className="text-button" onClick={() => void loadEvidence()} disabled={disabled || busy || !status?.configured}>{words.evidence}</button>
      <button type="button" className="text-button" onClick={() => void copyClientKey()} disabled={disabled || busy || !status?.configured}>{words.copyKey}</button>
    </div>
    {status?.routes?.length ? <div className="cockpit-route-grid" aria-label="Cockpit model routes">
      {status.routes.map(route => <div className="cockpit-route-card" key={route.id}>
        <span className="cockpit-route-provider">{route.provider.toUpperCase()}</span>
        <strong>{route.namespace}</strong>
        <span>{route.models.length ? `${route.models.length} models` : "all admitted models"} · {route.accountIds.length} accounts</span>
      </div>)}
    </div> : null}
    <div className={`cockpit-panel-evidence ${probe?.ok ? "is-ready" : probe ? "is-failed" : ""}`}>
      {probe ? `${probe.ok ? words.ready : words.failed}${probe.models.length ? ` · ${probe.models.length}` : ""}${probe.detail ? ` · ${probe.detail}` : ""}` : evidenceCount !== null ? `${words.evidence} · ${evidenceCount}` : evidenceLabel}
    </div>
  </section>;
}
