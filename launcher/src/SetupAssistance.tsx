import { useEffect, useState } from "react";
import { assistanceCopy, assistanceStateCopy } from "./setup-assistance-copy";
import { copyFor } from "./i18n";
import type { AgentDockConnection, Language, LauncherApi, MoonLetterInfo } from "./types";
import { CHAT_ON_STEROIDS_EXTENSION_URL, companionExtensionCopy } from "./companion-extension";
import "./setup-assistance.css";

export function AgentDockSurface({ api, language, preview, onNative2, onWebSetup, onBusyChange, embedded = false }: { api: LauncherApi; language: Language; preview: boolean; onNative2: () => void; onWebSetup?: (url:string)=>Promise<void>; onBusyChange?: (busy:boolean)=>void; embedded?: boolean }) {
  const copy = assistanceCopy[language];
  const [connection, setConnection] = useState<AgentDockConnection>({ url:"",publicUrl:"",state:"unconfigured",authenticated:false,tools:[] });
  const [url, setUrl] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    void api.agentDockRead().then(value => { if (!cancelled) { setConnection(value); setUrl(value.url); setPublicUrl(value.publicUrl); } }).catch(() => { if (!cancelled) setError("MCP configuration unavailable"); });
    const unsubscribe = api.onAgentDockChanged(value => { if (!cancelled) setConnection(value); });
    return () => { cancelled = true; unsubscribe(); };
  }, [api, preview]);
  const run = async (action: () => Promise<AgentDockConnection>) => { setBusy(true); setError(""); try { const next = await action(); setConnection(next); } catch (cause) { setError(String(cause)); } finally { setBusy(false); } };
  const dirty = url.trim() !== connection.url || publicUrl.trim() !== connection.publicUrl;
  const webUrl = connection.publicUrl || (connection.url.startsWith("https:") ? connection.url : "");
  const companion = companionExtensionCopy[language];
  const save = async () => {
    const input = {url:url.trim() || publicUrl.trim(), publicUrl:publicUrl.trim()};
    const next = preview ? {...input,state:"preview-only",authenticated:false,tools:[]} : await api.agentDockConfigure(input);
    setUrl(next.url); setPublicUrl(next.publicUrl); return next;
  };
  return <section className={`agentdock-page${embedded ? " is-embedded" : ""}`}>
    {!embedded ? <><small>{copy.webLane}</small><h1>{copy.agentDock}</h1></> : null}
    {preview ? <p className="assistance-notice">{copy.preview}</p> : null}
    <div className="agentdock-fields"><label>{copy.publicUrl}<input type="url" value={publicUrl} placeholder="https://your-domain.example/mcp" spellCheck={false} disabled={busy} onChange={event => setPublicUrl(event.target.value)}/></label>
      <details><summary>{copy.url}</summary><label><input aria-label={copy.url} type="url" value={url} placeholder="http://127.0.0.1:8765/mcp" spellCheck={false} disabled={busy} onChange={event => setUrl(event.target.value)}/></label></details></div>
    <div className="assistance-actions"><button type="button" className="button-primary" disabled={busy || !(url.trim() || publicUrl.trim())} onClick={() => void run(save)}>{copy.save}</button>
      <button type="button" className="button-secondary" disabled={busy || dirty || !connection.url || preview} onClick={() => void run(() => api.agentDockLogin())}>{copy.login}</button>
      <button type="button" className="button-secondary" disabled={busy || dirty || !connection.url} onClick={() => void run(() => preview ? Promise.resolve({...connection,state:"preview-only"}) : api.agentDockInspect())}>{copy.inspect}</button></div>
    <p className="agentdock-state" role="status">MCP · {assistanceStateCopy[language][connection.state] ?? connection.state}{connection.serverName ? ` · ${connection.serverName}` : ""}</p>
    {error ? <p className="assistance-error" role="alert">{error}</p> : null}
    {onWebSetup ? <div className="agentdock-web-next"><button type="button" className="button-primary" disabled={busy || dirty || !webUrl} onClick={() => void run(async () => { await onWebSetup(webUrl); return connection; })}>{copy.webSetup} →</button><small>{copy.webNotVerified}</small></div> : null}
    <section className="companion-extension" aria-label={companion.title}>
      <div><strong>{companion.title}</strong><p>{companion.body}</p></div>
      <button type="button" className="button-secondary" disabled={busy || preview} onClick={() => void run(async () => { await api.openExternal(CHAT_ON_STEROIDS_EXTENSION_URL); return connection; })}>{companion.install}</button>
    </section>
    <details className="agentdock-guide"><summary>{copy.guide}</summary><p>{copy.intro}</p><p>{copy.addressHelp}</p><p>{copy.authHelp}</p>{connection.url ? <p>{copy.registered}</p> : null}<a href="https://uvwt.github.io/agentdock-docs/zh-CN/docs/guides/chatgpt" target="_blank" rel="noreferrer">AgentDock ↗</a></details>
    <button type="button" className="text-button" onClick={onNative2}>{copy.native2} ↗</button>
  </section>;
}

export function WebAgentSetupGuide({ language, url, onClose }: { language: Language; url: string; onClose:()=>void }) {
  const copy = assistanceCopy[language];
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const steps = [copy.webStepOne,copy.webStepTwo,copy.webStepThree];
  return <aside className="web-agent-guide" aria-label={copy.webSetup}><div className="web-agent-guide-copy"><small>{copy.webLane} · 0{step+1} / 03</small><p>{steps[step]}</p>
    {step === 0 ? <div className="web-agent-address"><code>{url}</code><button type="button" className="text-button" onClick={() => { void navigator.clipboard.writeText(url).then(() => setCopied(true)).catch(() => setCopied(false)); }}>{copied ? copy.copiedAddress : copy.copyAddress}</button></div> : null}</div>
    <div className="web-agent-guide-actions"><button type="button" className="text-button" disabled={step===0} onClick={()=>setStep(step-1)}>←</button><button type="button" className="button-secondary" onClick={()=>step<2?setStep(step+1):onClose()}>{step<2?copyFor(language).next:copy.close}</button></div>
  </aside>;
}

export function MoonLetterPanel({ api, language, preview, beforeCreate, onClose }: {
  api: LauncherApi; language: Language; preview: boolean; beforeCreate: () => Promise<void>; onClose: () => void;
}) {
  const copy = assistanceCopy[language];
  const [letter, setLetter] = useState<MoonLetterInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Record<string, boolean | string> | null>(null);
  useEffect(() => {
    if (!letter || preview) return;
    let cancelled = false, inFlight = false;
    const refresh = async () => { if (inFlight) return; inFlight = true; try { const next = await api.moonLetterStatus(); if (!cancelled) setStatus(next); } catch { /* Explicit operation errors appear below. */ } finally { inFlight = false; } };
    void refresh(); const timer = window.setInterval(() => void refresh(), 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [api, letter, preview]);
  const create = async () => { setBusy(true); setError(""); try { await beforeCreate(); setLetter(await api.createMoonLetter(true)); } catch (cause) { setError(String(cause)); } finally { setBusy(false); } };
  const run = async (action: () => Promise<unknown>) => { setError(""); try { await action(); } catch (cause) { setError(String(cause)); } };
  return <div className="moon-letter-backdrop"><section className="moon-letter-panel" role="dialog" aria-modal="true" aria-labelledby="moon-letter-title">
    <small>{copy.entry}</small><h1 id="moon-letter-title">{copy.title}</h1>
    <p>{preview ? copy.preview : letter ? copy.secret : copy.consent}</p>
    {!letter ? <button type="button" className="button-primary" disabled={busy} onClick={() => void create()}>{copy.create}</button> : <>
      <textarea aria-label={copy.title} value={letter.text} readOnly rows={9}/>
      <div className="assistance-actions"><button type="button" className="button-primary" onClick={() => void run(async () => { await navigator.clipboard.writeText(letter.text); setCopied(true); })}>{copied ? copy.copied : copy.copy}</button>
        <button type="button" className="button-secondary" disabled={preview} onClick={() => void run(() => api.openMoonLetterControl())}>{copy.open}</button>
        <button type="button" className="button-secondary" disabled={preview} onClick={() => void run(async () => { await api.stopMoonLetter(); setStatus({state:"revoked"}); })}>{copy.stop}</button></div>
      <p>{status?.revoked ? assistanceStateCopy[language].revoked : status?.expired ? assistanceStateCopy[language].expired : status?.reviewRequired ? assistanceStateCopy[language].reviewRequired : copy.waiting}</p>
      {status ? <ul className="moon-letter-progress">{[[copyFor(language).stepAccount,status.signedIn],[copyFor(language).setup,status.coreInstalled],["Native2",status.callbackVerified],["AgentDock",status.agentDock === "connected"]].map(([label,ready]) => <li key={String(label)}><span>{label}</span><small>{ready ? "✓" : assistanceStateCopy[language].unverified}</small></li>)}</ul> : null}
      {letter.path ? <small className="moon-letter-path">{letter.path}</small> : null}
    </>}
    {error ? <p className="assistance-error" role="alert">{error}</p> : null}
    <footer><button type="button" className="text-button" disabled={busy} onClick={onClose}>{copy.close}</button></footer>
  </section></div>;
}
