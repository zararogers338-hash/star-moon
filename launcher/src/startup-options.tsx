import { useEffect, useId, useRef, useState } from "react";
import { startupCopy } from "./startup-copy";
import type { Language, LauncherApi, LauncherState } from "./types";

export type StartupOption = "autoStart" | "keepRunningOnClose";
export class StartupOptionError extends Error {
  constructor(readonly reason: "unsupported" | "unconfirmed") {
    super(reason === "unsupported" ? "Login startup is not supported" : "The requested startup preference was not confirmed");
    this.name = "StartupOptionError";
  }
}

// Preserve native state exactly. Neither a resolved call nor a requested value
// alone is a success receipt, especially when OS login startup is unsupported.
export async function saveStartupOption({ api, option, enabled, updateState, onBusyChange }: {
  api: Pick<LauncherApi, "setAutostart" | "setPreference">;
  option: StartupOption;
  enabled: boolean;
  updateState: (state: LauncherState) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  onBusyChange?.(true);
  try {
    if (option === "autoStart") {
      const result = await api.setAutostart(enabled);
      updateState(result.state);
      if (!result.supported) throw new StartupOptionError("unsupported");
      if (result.enabled !== enabled || result.state.autoStart !== enabled) throw new StartupOptionError("unconfirmed");
      return;
    }
    const state = await api.setPreference("keepRunningOnClose", enabled);
    updateState(state);
    if (state.keepRunningOnClose !== enabled) throw new StartupOptionError("unconfirmed");
  } finally { onBusyChange?.(false); }
}

export function StartupOptions({ api, language, state, updateState, preview = false, disabled = false, onBusyChange }: {
  api: Pick<LauncherApi, "setAutostart" | "setPreference">;
  language: Language;
  state: LauncherState;
  updateState: (state: LauncherState) => void;
  preview?: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const copy = startupCopy[language];
  const id = useId();
  const saving = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<{ unsupported: boolean; detail: string } | null>(null);
  const [previewChoices, setPreviewChoices] = useState({ autoStart: Boolean(state.autoStart), keepRunningOnClose: Boolean(state.keepRunningOnClose) });
  const choices = preview ? previewChoices : state;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; onBusyChange?.(false); };
  }, [onBusyChange]);

  const change = async (option: StartupOption, enabled: boolean) => {
    if (disabled || saving.current) return;
    if (preview) {
      setPreviewChoices(current => ({ ...current, [option]: enabled }));
      return;
    }
    saving.current = true;
    setBusy(true); setSaved(false); setFailure(null);
    try {
      await saveStartupOption({ api, option, enabled, updateState, onBusyChange });
      if (mounted.current) setSaved(true);
    } catch (error) {
      if (mounted.current) setFailure({ unsupported: error instanceof StartupOptionError && error.reason === "unsupported", detail: error instanceof Error ? error.message : String(error) });
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return <section className="startup-options" aria-labelledby={`${id}-title`} data-preview={preview}>
    <div className="section-heading"><span id={`${id}-title`}>{copy.title}</span></div>
    <p className="bigger-context-recommendation-body">{copy.intro}</p>
    {(["autoStart", "keepRunningOnClose"] as const).map(option => {
      const title = option === "autoStart" ? copy.login : copy.keepRunning;
      const body = option === "autoStart" ? copy.loginBody : copy.keepRunningBody;
      return <div className="bigger-context-recommendation-toggle startup-option" key={option}>
        <div><strong>{title}</strong><p id={`${id}-${option}`}>{body}</p></div>
        <button type="button" role="switch" className={`switch${choices[option] ? " is-on" : ""}`}
          aria-label={title} aria-describedby={`${id}-${option}`} aria-checked={Boolean(choices[option])}
          disabled={disabled || busy} onClick={() => void change(option, !choices[option])}><span /></button>
      </div>;
    })}
    {preview ? <p className="journey-preview-notice" role="note">{copy.preview}</p> : null}
    {!preview && (busy || saved) ? <p className="startup-options-status" role="status">{busy ? copy.saving : copy.saved}</p> : null}
    {failure ? <div className="journey-failure" role="alert"><p>{failure.unsupported ? copy.unsupported : copy.failed}</p><details><summary>{copy.details}</summary><pre>{failure.detail}</pre></details></div> : null}
    <details className="welcome-about startup-separate-options"><summary>{copy.separateTitle}</summary><p>{copy.separateBody}</p></details>
  </section>;
}
