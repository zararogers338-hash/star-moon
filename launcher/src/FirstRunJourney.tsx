import { motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { externalBrowserCloseHint, externalLoginCopy } from "./external-login-copy";
import { pausedSetupCopy } from "./PausedSetup";
import { resumedJourneyStage } from "./configuration-journey";
import { AntarcticStar, OnboardingScene } from "./OnboardingScene";
import { MoonThemeSwitch, useAppearance } from "./appearance";
import { MoonRouteGuide } from "./MoonBook";
import { AgentDockSurface } from "./SetupAssistance";
import { StartupOptions } from "./startup-options";
import { copyFor } from "./i18n";
import { Icon } from "./icons";
import { journeyCopy } from "./journey-copy";
import { setupFailureHint, setupRecoveryCopy } from "./setup-recovery";
import { CatalogReadiness, catalogIntro, catalogContinue, catalogDeferredNotice } from "./CatalogReadiness";
import { CodexCopiesPanel } from "./CodexCopies";
import { afterCatalogStage, afterEndlessNightStage, agentDockConnected, applyEndlessNightChoice, continueAgentDockJourney, endlessNightNeedsCatalog, initialJourneyStage, journeyBackStage, journeyChapters, journeyGoalOrder, journeyScenes, journeyStageGoals, provisionAutomaticJourney, savedMcpJourneyStage, type JourneyStage } from "./configuration-journey";
import { presentationCopy } from "./onboarding-presentation";
import { useReducedMotionPreference } from "./useReducedMotionPreference";
import type { AgentDockConnection, BrowserState, DoctorReport, Language, LauncherApi, LauncherSnapshot, LauncherState, OperationState } from "./types";

// Passed only by the isolated browser fixture, never through IPC or saved state.
export type JourneyPreview = {
  copyFor: (language: Language) => { notice: string; next: string; enter: string; complete: string; completeBody: string };
  finish: () => void;
  startAt?: JourneyStage;
};

export function FirstRunJourney({ api, browser, language, operation, refresh, snapshot, updateState, preview }: {
  api: LauncherApi;
  browser: BrowserState | null;
  language: Language;
  operation: OperationState | null;
  refresh: () => Promise<LauncherSnapshot>;
  snapshot: LauncherSnapshot;
  updateState: (state: LauncherState) => void;
  preview?: JourneyPreview;
}) {
  const copy = copyFor(language);
  const words = journeyCopy[language];
  const recovery = setupRecoveryCopy[language];
  const presentation = presentationCopy[language];
  const previewWords = preview?.copyFor(language);
  const { theme } = useAppearance();
  const reducedMotion = useReducedMotionPreference();
  const [stage, setStage] = useState<JourneyStage>(() => preview?.startAt && journeyChapters(snapshot.state.browserInteractionMode).includes(preview.startAt)
    ? preview.startAt : resumedJourneyStage({ ...snapshot, browser }));
  const stageRef = useRef(stage);
  const [direction, setDirection] = useState(1);
  const [viewingPrevious, setViewingPrevious] = useState(Boolean(snapshot.state.guidedSetupResumeStage));
  const [localBusy, setLocalBusy] = useState(false);
  const inFlight = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [diagnosticMessage, setDiagnosticMessage] = useState<string | null>(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserSlot, setBrowserSlot] = useState<HTMLDivElement | null>(null);
  const [tunnelId, setTunnelId] = useState("");
  const [runtimeKey, setRuntimeKey] = useState("");
  const [replaceCredentials, setReplaceCredentials] = useState(false);
  const loginRequest = useRef<Promise<void> | null>(null);
  const loginAttempt = useRef(0);
  const loginControlLock = useRef(false);
  const [loginControlBusy, setLoginControlBusy] = useState(false);
  const [externalLoginActive, setExternalLoginActive] = useState(false);
  const [externalContinuationRequested, setExternalContinuationRequested] = useState(false);
  const externalLoginRequest = useRef<Promise<void> | null>(null);
  const externalLoginCancelled = useRef(false);
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [agentDockConnection, setAgentDockConnection] = useState<AgentDockConnection | null>(null);
  const [agentDockBusy, setAgentDockBusy] = useState(false);
  const [startupBusy, setStartupBusy] = useState(false);
  const startupBusyRef = useRef(false);
  const handleStartupBusy = useCallback((value: boolean) => { startupBusyRef.current = value; setStartupBusy(value); }, []);
  const [agentDockReadError, setAgentDockReadError] = useState<string | null>(null);
  const endlessNightRetryChoice = useRef<boolean | null>(null);
  const [previewEndlessNightEnabled, setPreviewEndlessNightEnabled] = useState(Boolean(snapshot.state.experimentalBiggerContext));
  const manual = snapshot.state.browserInteractionMode === "manual";
  const externalWords = externalLoginCopy[language];
  const externalLoginSupported = !manual && ["linux", "darwin"].includes(snapshot.platform);
  const externalLoginWaiting = externalLoginActive && operation?.name === "passkey-login" && operation.status === "running";
  const busy = localBusy || operation?.status === "running" || (!preview && agentDockBusy) || startupBusy;
  const savedCredentials = snapshot.mcpCredentialsConfigured && !replaceCredentials;
  const endlessNightEnabled = preview ? previewEndlessNightEnabled : Boolean(snapshot.state.experimentalBiggerContext);
  const endlessNightWaiting = !preview && endlessNightNeedsCatalog(snapshot.state);
  const chapters = journeyChapters(snapshot.state.browserInteractionMode);
  const index = chapters.indexOf(stage);
  const goal = journeyStageGoals[stage];
  const goalIndex = journeyGoalOrder.indexOf(goal);
  const agentDockReady = agentDockConnected(agentDockConnection);
  const move = useCallback((next: JourneyStage, backwardsReview = false) => {
    setDirection(chapters.indexOf(next) < chapters.indexOf(stageRef.current) ? -1 : 1);
    setViewingPrevious(backwardsReview);
    stageRef.current = next;
    setStage(next);
  }, [chapters]);
  const focusHeading = useCallback((node: HTMLHeadingElement | null) => {
    node?.focus({ preventScroll: true });
    if (node) requestAnimationFrame(() => node.closest(".welcome-stage")?.scrollTo({ top: 0, left: 0, behavior: "instant" }));
  }, []);

  useEffect(() => {
    if (preview || busy) return;
    void api.rememberGuidedSetupPage(stage).catch(error => setDiagnosticMessage(String(error)));
  }, [api, stage, preview, busy]);

  const run = async (action: () => Promise<void>) => {
    if (inFlight.current || operation?.status === "running" || startupBusyRef.current) return;
    inFlight.current = true;
    setLocalBusy(true);
    setFailure(null);
    try { await action(); }
    catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
    finally { inFlight.current = false; setLocalBusy(false); }
  };

  // Diagnostic actions keep the original error and navigation position. They
  // never retry model calls or mark an installation complete.
  const recover = async (action: () => Promise<void>) => {
    if (inFlight.current || busy || startupBusyRef.current) return;
    inFlight.current = true;
    setLocalBusy(true);
    setDiagnosticMessage(null);
    try { await action(); }
    catch (error) { setDiagnosticMessage(`${recovery.failed} ${error instanceof Error ? error.message : String(error)}`); }
    finally { inFlight.current = false; setLocalBusy(false); }
  };

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    let revision = 0;
    const unsubscribe = api.onAgentDockChanged(connection => {
      revision++;
      if (!cancelled) { setAgentDockConnection(connection); setAgentDockReadError(null); }
    });
    const readRevision = revision;
    void api.agentDockRead().then(connection => {
      // A slow initial read must not overwrite a newer native check event.
      if (!cancelled && revision === readRevision) { setAgentDockConnection(connection); setAgentDockReadError(null); }
    }).catch(error => {
      if (!cancelled && revision === readRevision) { setAgentDockConnection(null); setAgentDockReadError(String(error)); }
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [api, preview]);

  // The embedded official login remains inside this chapter, without a task bar.
  useLayoutEffect(() => {
    if (preview) return;
    let cancelled = false;
    let frame = 0;
    let observer: ResizeObserver | undefined;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!browserSlot || cancelled) return;
        const { x, y, width, height } = browserSlot.getBoundingClientRect();
        void api.setBrowserBounds({ x, y, width, height }).catch(error => { if (!cancelled) setFailure(String(error)); });
      });
    };
    void api.setBrowserSurfaceActive(showBrowser).then(() => {
      if (!showBrowser || !browserSlot || cancelled) return;
      measure();
      observer = new ResizeObserver(measure);
      observer.observe(browserSlot);
      window.addEventListener("resize", measure);
    }).catch(error => { if (!cancelled) setFailure(String(error)); });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [api, showBrowser, browserSlot, preview]);

  useEffect(() => {
    if (preview || busy || failure || viewingPrevious) return;
    if (stage === "account" && browser?.authenticated) {
      setShowBrowser(false);
      move(initialJourneyStage({ ...snapshot, browser }));
    }
    if (stage === "catalog" && snapshot.state.codexCatalogVerified && !snapshot.state.codexRestartRequired) {
      move(afterCatalogStage(snapshot));
    }
  }, [stage, busy, failure, browser?.authenticated, snapshot, move, preview, viewingPrevious]);

  const open = (url: string) => run(async () => { await api.openExternal(url); });
  const openLogin = (reload = false) => {
    const attempt = ++loginAttempt.current;
    const request = run(async () => {
      setViewingPrevious(false);
      setShowBrowser(true);
      await api.setBrowserSurfaceActive(true);
      if (attempt !== loginAttempt.current) return;
      if (reload) await api.reloadLogin();
      else await api.openLogin();
      await refresh();
    });
    loginRequest.current = request;
    return request;
  };
  const openExternalLogin = () => {
    externalLoginCancelled.current = false;
    setExternalContinuationRequested(false);
    const request = run(async () => {
      setExternalLoginActive(true);
      setViewingPrevious(false);
      setShowBrowser(false);
      await api.setBrowserSurfaceActive(false);
      try {
        await api.openPasskeyLogin();
        await refresh();
      } catch (error) {
        if (!externalLoginCancelled.current) throw error;
      } finally { setExternalLoginActive(false); }
    });
    externalLoginRequest.current = request;
    return request;
  };
  const authorizeExternalLogin = async () => {
    if (!externalLoginWaiting || externalContinuationRequested) return;
    setExternalContinuationRequested(true);
    try { await api.continuePasskeyLogin(); }
    catch (error) {
      setExternalContinuationRequested(false);
      setFailure(error instanceof Error ? error.message : String(error));
    }
  };
  const cancelExternalLogin = async () => {
    if (!externalLoginWaiting || externalContinuationRequested) return;
    externalLoginCancelled.current = true;
    try { await api.cancelPasskeyLogin(); await externalLoginRequest.current; await refresh(); }
    catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
  };
  const openAgentDockWebSetup = async (_url: string) => {
    if (preview) return;
    await run(async () => {
      setShowBrowser(true);
      await api.setBrowserSurfaceActive(true);
      // The native opener owns its allowlisted destination; do not navigate to
      // a URL supplied by page content or treat an opened page as a receipt.
      await api.openAgentDockWebSetup();
      await refresh();
    });
  };
  const provision = () => run(async () => {
    try {
      await provisionAutomaticJourney({
        api: {
          setupCore: () => api.setupCore(),
          smokeTest: async () => {
            setShowBrowser(true);
            await api.setBrowserSurfaceActive(true);
            try { return await api.smokeTest(); }
            finally { setShowBrowser(false); await api.setBrowserSurfaceActive(false); }
          },
        }, refresh, move,
      });
    } finally { setShowBrowser(false); }
  });
  const continueWithoutCatalog = () => run(async () => {
    const saved = await api.deferCatalogCheck();
    updateState(saved);
    const next = await refresh();
    if (saved.catalogCheckDeferred !== true || next.state.catalogCheckDeferred !== true) throw new Error(words.interrupted);
    move(afterCatalogStage(next));
  });
  const connect = () => run(async () => {
    const before = await refresh();
    const savedStage = savedCredentials ? savedMcpJourneyStage(before) : null;
    if (savedStage) { move(savedStage); return; }
    const result = await api.setupMcp({ interactionMode: snapshot.state.browserInteractionMode,
      ...(savedCredentials ? { replace: false } : { tunnelId: tunnelId.trim(), runtimeKey, replace: true }),
    });
    if (!result.ok) throw new Error(words.interrupted);
    setRuntimeKey("");
    setTunnelId("");
    setReplaceCredentials(false);
    const next = await refresh();
    if (!next.state.mcpRuntimeInstalled || !next.mcpCredentialsConfigured) throw new Error(words.interrupted);
    move(endlessNightNeedsCatalog(next.state) ? "catalog" : "connector");
  });
  const verify = () => run(async () => {
    const before = await refresh();
    const savedStage = !failure ? savedMcpJourneyStage(before, true) : null;
    if (savedStage) { move(savedStage); return; }
    move("verify");
    setReport(null);
    const result = await api.verifyMcp();
    setReport(result);
    const next = await refresh();
    if (!result.ok || !next.state.mcpSetupComplete) throw new Error(words.interrupted);
    if (endlessNightNeedsCatalog(next.state)) { move("catalog"); return; }
    move("agentdock");
  });
  const continueAgentDock = () => run(async () => {
    await continueAgentDockJourney({ api, move, updateConnection: connection => {
      setAgentDockConnection(connection); setAgentDockReadError(null);
    } });
  });
  const setEndlessNight = (enabled: boolean) => {
    if (manual) return;
    if (preview) {
      // Preview choices live only in component state: no IPC, refresh, saved
      // preference, synthetic readiness receipt, or quota-consuming test.
      setPreviewEndlessNightEnabled(enabled);
      return;
    }
    return run(async () => {
      endlessNightRetryChoice.current = enabled;
      setReport(null);
      await applyEndlessNightChoice({ api, refresh, updateState, enabled,
        unavailable: words.endlessNightUnavailable, interrupted: words.interrupted });
    });
  };
  const continueEndlessNight = () => run(async () => {
    endlessNightRetryChoice.current = null;
    const next = await refresh();
    const connection = await api.agentDockRead();
    setAgentDockConnection(connection);
    move(afterEndlessNightStage(next, connection));
  });
  const finish = () => run(async () => {
    try { updateState(await api.finishGuidedSetup()); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      move(message.includes("AgentDock") ? "agentdock" : "verify");
      throw error;
    }
  });
  const controlLogin = async (reload: boolean) => {
    if (loginControlLock.current) return;
    loginControlLock.current = true;
    setLoginControlBusy(true);
    ++loginAttempt.current;
    let resume = false;
    try {
      await api.cancelLogin();
      await loginRequest.current;
      if (reload) resume = true;
      else {
        await api.setBrowserSurfaceActive(false);
        setShowBrowser(false);
        await refresh();
      }
    } catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
    finally { loginControlLock.current = false; setLoginControlBusy(false); }
    if (resume) await openLogin(true);
  };
  const closeLogin = () => stage === "account" ? controlLogin(false) : run(async () => {
    await api.setBrowserSurfaceActive(false);
    setShowBrowser(false);
    await refresh();
  });
  const primary = () => {
    if (startupBusyRef.current) return;
    if (preview) {
      const next = chapters[index + 1];
      if (next) move(next);
      else preview.finish();
      return;
    }
    if (stage === "account") return browser?.authenticated
      ? run(async () => { const next = await refresh(); move(next.browser?.authenticated ? "prepare" : "account"); })
      : externalLoginSupported ? openExternalLogin() : openLogin();
    if (["prepare", "smoke", "install"].includes(stage)) return provision();
    if (stage === "catalog") return continueWithoutCatalog();
    if (stage === "tunnel") return run(async () => { updateState(await api.setMcpStep(1)); move("credentials"); });
    if (stage === "credentials") return connect();
    if (stage === "connector" || stage === "verify") return verify();
    if (stage === "agentdock") return continueAgentDock();
    if (stage === "endless-night") {
      if (failure && endlessNightRetryChoice.current !== null) {
        return setEndlessNight(endlessNightRetryChoice.current);
      }
      return continueEndlessNight();
    }
    return finish();
  };
  const primaryLabel = previewWords ? (stage === "complete" ? previewWords.enter : previewWords.next)
    : busy ? copy.running : failure ? words.retry
    : stage === "account" ? (browser?.authenticated ? copy.next : externalLoginSupported
      ? snapshot.platform === "linux" ? externalWords.start : externalWords.chrome : copy.signIn)
    : stage === "prepare" ? (snapshot.smokePassed && snapshot.state.coreSetupComplete ? copy.next : words.consent)
    : stage === "catalog" ? catalogContinue[language] : stage === "credentials" ? copy.connect
    : stage === "agentdock" ? (agentDockReady ? words.agentdockContinue : words.agentdockWaiting)
    : stage === "endless-night" ? (endlessNightWaiting ? words.waiting : manual ? words.endlessNightManualContinue : endlessNightEnabled ? words.endlessNightOn : words.endlessNightOff)
    : stage === "connector" ? words.connectorDone : stage === "complete" ? words.enter : copy.next;
  const body = stage === "account" ? words.accountBody
    : stage === "prepare" ? (snapshot.smokePassed && snapshot.state.coreSetupComplete ? words.resume : words.prepareBody)
    : stage === "smoke" || stage === "install" || stage === "verify" ? words.automatic
    : stage === "catalog" ? catalogIntro[language] : stage === "tunnel" ? copy.mcpStepOneBody
    : stage === "credentials" ? copy.mcpStepTwoBody : stage === "connector" ? (manual ? copy.manualMcpStepThreeBody : copy.mcpStepThreeBody)
    : stage === "agentdock" ? words.agentdockBody
    : stage === "endless-night" ? words.endlessNightBody
    : manual ? words.manualCompleteBody : words.completeBody;
  const previous = preview ? chapters[index - 1] ?? null
    : journeyBackStage(stage, snapshot.state.browserInteractionMode);
  const goBack = () => {
    if (!previous || busy || inFlight.current || startupBusyRef.current) return;
    setFailure(null);
    move(previous, true);
  };
  const returnToOnboarding = () => run(async () => {
    if (preview) return;
    updateState(await api.reopenOnboarding());
  });
  const canReturnToOnboarding = !preview && previous === null
    && (stage === "account" || (manual && stage === "tunnel"));
  const disablePrimary = !preview && (busy
    || (stage === "agentdock" && !agentDockReady)
    || (stage === "endless-night" && endlessNightWaiting)
    || (stage === "credentials" && !savedCredentials && (!tunnelId.trim() || !runtimeKey.trim())));

  return <motion.main className="welcome first-run-journey" lang={language} data-stage={stage} data-goal={goal} data-chapter-index={index + 1} data-chapter-count={chapters.length} data-reduced-motion={reducedMotion} data-preview={Boolean(preview)}
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .22 }}>
    <OnboardingScene stage={journeyScenes[stage]} theme={theme} direction={direction} reducedMotion={reducedMotion} />
    <div className="welcome-art-word" aria-hidden="true">star <em>&amp;</em> moon</div>
    <header className="welcome-top draggable">
      <div className="welcome-brand"><div>{copy.product}<small>{presentation.lab}</small></div></div>
      <div className="welcome-top-actions"><MoonThemeSwitch language={language} />
        {!preview ? <button type="button" className="button-secondary" disabled={busy} title={pausedSetupCopy[language].body} onClick={() => void run(async () => updateState(await api.pauseGuidedSetup(stage)))}>{pausedSetupCopy[language].pause}</button> : null}
        <span className="welcome-version no-drag">v{snapshot.version}</span></div>
    </header>
    <div className="welcome-body">
      {/* Back must replace the old controls immediately; a hidden Electron
          window may never finish an outgoing requestAnimationFrame animation. */}
      <>
        <motion.section className="welcome-stage journey-chapter" key={stage} aria-labelledby="journey-heading" custom={direction}
          initial="enter" animate="present" exit="leave" variants={{ enter: (travel: number) => ({ opacity: 0, x: reducedMotion ? 0 : travel * 28 }), present: { opacity: 1, x: 0 }, leave: (travel: number) => ({ opacity: 0, x: reducedMotion ? 0 : travel * -20 }) }}
          transition={{ duration: reducedMotion ? 0 : .32, ease: [.22, 1, .36, 1] }}>
          <div className="welcome-kicker"><span>{String(goalIndex + 1).padStart(2, "0")}</span><i aria-hidden="true" /><span>{words[goal]}</span></div>
          <h1 id="journey-heading" tabIndex={-1} ref={focusHeading}>{stage === "complete" && previewWords ? previewWords.complete : words[stage]}</h1>
          {stage === "endless-night" ? <><p className="feature-tagline journey-endless-night-tagline">{copy.biggerContextTagline}</p><small className="journey-endless-night-subtitle">{copy.biggerContextSubtitle}</small></> : null}
          {previewWords ? <p className="journey-preview-notice" role="note">{previewWords.notice}</p> : null}
          <p>{stage === "complete" && previewWords ? previewWords.completeBody : body}</p>
          {!preview && stage === "account" && externalLoginSupported ? <section className="journey-external-login">
            <p role="note">{externalWords.body}</p>
            {externalLoginActive ? <>
              <p role="status">{externalContinuationRequested ? externalWords.importing : externalWords.waiting}</p>
              {snapshot.platform === "linux" ? <p role="note">{externalBrowserCloseHint[language]}</p> : null}
              <div className="journey-links">
                <button type="button" className="button-primary" disabled={!externalLoginWaiting || externalContinuationRequested} onClick={() => void authorizeExternalLogin()}>{externalWords.authorize}</button>
                <button type="button" className="button-secondary" disabled={!externalLoginWaiting || externalContinuationRequested} onClick={() => void cancelExternalLogin()}>{externalWords.cancel}</button>
              </div>
            </> : <button type="button" className="text-button" disabled={busy} onClick={() => void openLogin()}>{externalWords.embedded}</button>}
          </section> : null}
          {stage === "prepare" || (manual && stage === "tunnel") ? <StartupOptions api={api} language={language} state={snapshot.state}
            updateState={updateState} preview={Boolean(preview)} disabled={busy} onBusyChange={handleStartupBusy} /> : null}
          {stage === "agentdock" ? <div className="journey-agentdock">
            <AgentDockSurface api={api} language={language} preview={Boolean(preview)} embedded onWebSetup={openAgentDockWebSetup} onBusyChange={setAgentDockBusy}
              onNative2={() => { if (!busy && !inFlight.current) { setFailure(null); move("connector", true); } }} />
            {!preview && !agentDockReady ? <p className="journey-agentdock-waiting" role="status">{words.agentdockWaiting}</p> : null}
            {!preview && agentDockReadError ? <details className="journey-failure"><summary>{words.viewDetails}</summary><pre>{agentDockReadError}</pre></details> : null}
          </div> : null}
          {stage === "endless-night" ? <div className="journey-endless-night-choice">
            <p className="bigger-context-recommendation-body" id="journey-endless-night-disclosure">{manual ? copy.manualBiggerContextUnavailable : copy.biggerContextRecommendationBody}</p>
            <div className="bigger-context-recommendation-toggle journey-endless-night-toggle">
              <div><strong>{copy.biggerContext}</strong><p>{manual ? words.endlessNightManualSaved : copy.biggerContextRecommendationToggleBody}</p></div>
              <button type="button" role="switch" className={`switch${endlessNightEnabled ? " is-on" : ""}`} aria-checked={endlessNightEnabled}
                aria-label={preview ? words.endlessNightPreviewToggle : copy.biggerContextSubtitle}
                aria-describedby={preview ? "journey-endless-night-disclosure journey-endless-night-preview" : "journey-endless-night-disclosure"}
                disabled={busy || manual || (!preview && snapshot.state.coreSetupComplete !== true)} onClick={() => void setEndlessNight(!endlessNightEnabled)}><span /></button>
            </div>
            {preview ? <p className="journey-preview-notice" id="journey-endless-night-preview" role="note">{words.endlessNightPreview}</p> : null}
            {!manual ? <details className="welcome-about"><summary>{words.details}</summary><p>{copy.biggerContextBody}</p></details> : null}
            {endlessNightWaiting ? <div className="journey-endless-night-restart"><p role="status">{words.endlessNightRestart}</p><button type="button" className="button-secondary" disabled={busy} onClick={() => void run(async () => { await refresh(); })}>{words.endlessNightRecheck}</button></div> : null}
          </div> : null}
          {stage === "tunnel" ? <>
            <div className="journey-links">
              <button type="button" className="button-secondary" disabled={busy || Boolean(preview)} onClick={() => void open(snapshot.urls.tunnels)}>{copy.openTunnels}<Icon name="external" /></button>
              <button type="button" className="button-secondary" disabled={busy || Boolean(preview)} onClick={() => void open(snapshot.urls.keys)}>{copy.openKeys}<Icon name="external" /></button>
            </div>
            <details className="welcome-about"><summary>{words.details}</summary><p>{words.scope}</p></details>
            <MoonRouteGuide language={language}/>
          </> : null}
          {stage === "credentials" ? savedCredentials ? <div className="journey-saved"><p>{words.saved}</p><button type="button" className="text-button" disabled={busy} onClick={() => setReplaceCredentials(true)}>{words.editCredentials}</button></div>
            : <div className="journey-fields">
              <label><span>{copy.tunnelId}</span><input value={tunnelId} autoComplete="off" spellCheck={false} autoCapitalize="none" placeholder={preview ? "PREVIEW ONLY" : "tunnel_…"} disabled={busy || Boolean(preview)} onChange={event => setTunnelId(event.target.value)} /></label>
              <label><span>{copy.runtimeKey}</span><input value={runtimeKey} type="password" autoComplete="off" spellCheck={false} autoCapitalize="none" placeholder={preview ? "PREVIEW ONLY" : "sk-…"} disabled={busy || Boolean(preview)} onChange={event => setRuntimeKey(event.target.value)} /></label>
            </div> : null}
          {stage === "connector" ? <>
            <div className="journey-connector-name"><small>{copy.connectorName}</small><code>{snapshot.connectorNames[snapshot.state.browserInteractionMode]}</code></div>
            <div className="journey-links"><button type="button" className="button-secondary" disabled={busy || Boolean(preview)} onClick={() => void open(snapshot.urls.connectors)}>{copy.openConnectors}<Icon name="external" /></button></div>
            <details className="welcome-about"><summary>{words.details}</summary><p>{manual ? copy.manualConnectorNotice : copy.connectorMigrationNotice}</p></details>
          </> : null}
          {!preview && stage === "catalog" ? <CatalogReadiness api={api} language={language} disabled={busy} onContinue={() => void continueWithoutCatalog()} /> : null}
          {!preview && snapshot.state.catalogCheckDeferred && !snapshot.state.codexCatalogVerified ? <p className="journey-preview-notice" role="note">{catalogDeferredNotice[language]}</p> : null}
          <CodexCopiesPanel api={api} language={language} preview={Boolean(preview)} disabled={busy} />
          {!preview && (busy || stage === "catalog") ? <div className="journey-live-status" role="status"><AntarcticStar /><span>{busy ? words.automatic : words.waiting}</span></div> : null}
          {failure ? <div className="journey-failure" role="alert"><p>{words.interrupted}</p>{setupFailureHint(failure, language) ? <p>{setupFailureHint(failure, language)}</p> : null}<details><summary>{words.viewDetails}</summary><pre>{failure}</pre></details></div> : null}
          {!preview ? <details className="journey-recovery" open={failure ? true : undefined}>
            <summary>{recovery.title}</summary><p>{recovery.hint}</p>
            <div className="journey-recovery-actions">
              <button type="button" className="button-secondary" disabled={busy} onClick={() => void recover(async () => { setReport(await api.doctor()); setDiagnosticMessage(recovery.done); })}>{recovery.check}</button>
              <button type="button" className="button-secondary" disabled={busy} onClick={() => void recover(async () => { const path = await api.exportLogs(); if (path) setDiagnosticMessage(path); })}>{recovery.export}</button>
              <button type="button" className="button-secondary" disabled={busy} onClick={() => void recover(async () => { await api.openDevTools(); })}>{recovery.debug}</button>
              {snapshot.state.coreSetupComplete ? <button type="button" className="button-secondary" disabled={busy} onClick={() => void recover(async () => {
                const result = await api.uninstallIntegration();
                if (!result.cancelled) { updateState(result.state); setFailure(null); move(manual ? "credentials" : "prepare", true); await refresh(); }
              })}>{recovery.rollback}</button> : null}
            </div>
            {diagnosticMessage ? <p role="status">{diagnosticMessage}</p> : null}
          </details> : null}
          {report && stage !== "endless-night" && stage !== "agentdock" ? <details className="welcome-about"><summary>{words.viewDetails}</summary><ul>{report.checks.map((check, checkIndex) => <li key={`${check.id}-${checkIndex}`}>{check.message}</li>)}</ul></details> : null}
        </motion.section>
      </>
    </div>
    <div className="welcome-art-caption" aria-hidden="true"><AntarcticStar /><span>{presentation.signature}</span><small>ANTARCTIC STAR LAB</small></div>
    <footer className="welcome-footer">
      <div>{previous ? <button type="button" className="text-button" disabled={busy} onClick={goBack}><Icon name="back" />{copy.previous}</button>
        : canReturnToOnboarding ? <button type="button" className="text-button" disabled={busy} onClick={() => void returnToOnboarding()}><Icon name="back" />{copy.previous}</button> : null}</div>
      <div className="welcome-progress journey-goal-progress" role="progressbar" aria-label={words.chapter} aria-valuemin={1} aria-valuemax={journeyGoalOrder.length} aria-valuenow={goalIndex + 1} aria-valuetext={words[goal]}>
        <div className="journey-progress-line" aria-hidden="true"><i style={{ transform: `scaleX(${(goalIndex + 1) / journeyGoalOrder.length})` }} /></div>
        <ol className="journey-goal-list" aria-hidden="true">{journeyGoalOrder.map((item, itemIndex) => <li key={item} data-goal={item} className={item === goal ? "is-current" : undefined}><span>{String(itemIndex + 1).padStart(2, "0")}</span><small>{words[item]}</small></li>)}</ol>
      </div>
      <button type="button" className="button-primary" disabled={disablePrimary} onClick={() => void primary()}>{primaryLabel}<Icon name="chevron" /></button>
    </footer>
    {showBrowser ? <div className="journey-browser-panel" role="dialog" aria-modal="true" aria-label={stage === "agentdock" ? words.agentdockBrowser : copy.stepAccount}>
      <header><strong>{stage === "agentdock" ? words.agentdockBrowser : stage === "smoke" ? words.smoke : copy.stepAccount}</strong><div className="journey-login-controls">
        {stage === "account" ? <button type="button" className="button-secondary" disabled={loginControlBusy} onClick={() => void controlLogin(true)}><Icon name="reload" />{copy.reload}</button> : null}
        <button type="button" className="button-secondary" disabled={stage === "account" ? loginControlBusy : busy} onClick={() => void closeLogin()}>{words.returnFromLogin}</button>
      </div></header>
      <div className="journey-browser-slot" ref={setBrowserSlot} />
    </div> : null}
  </motion.main>;
}
