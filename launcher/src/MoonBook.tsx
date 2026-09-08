import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoonThemeSwitch, useAppearance } from "./appearance";
import { BrowserConstellation } from "./BrowserConstellation";
import { OnboardingScene } from "./OnboardingScene";
import { copyFor } from "./i18n";
import { moonBookCopy } from "./moon-book-copy";
import { connectionFromDoctor, type MoonConnectionResult } from "./moon-connection";
import { presentationCopy } from "./onboarding-presentation";
import { useReducedMotionPreference } from "./useReducedMotionPreference";
import cloudflareCloud from "./assets/cloudflare-cloud-cutout.png";
import type { Copy } from "./i18n";
import type { DoctorReport, Language, Surface } from "./types";
import "./moon-book.css";

export function MoonBook({ children, copy, language, surface, navigate, version, extra }: {
  children: ReactNode; copy: Copy; language: Language; surface: Surface;
  navigate: (surface: Surface) => void; version: string; extra?: ReactNode;
}) {
  const words = moonBookCopy[language];
  const chapters: { id: Surface; title: string }[] = [
    { id: "connection", title: words.connection }, { id: "browser", title: copy.browser },
    { id: "setup", title: copy.configuration }, { id: "mcp", title: "MCP" },
    { id: "activity", title: copy.activity }, { id: "settings", title: copy.settings },
  ];
  const page = chapters.findIndex(chapter => chapter.id === surface) + 1;
  return <main className="moon-book-shell" lang={language}>
    <header className="moon-book-masthead draggable">
      <div className="moon-book-wordmark no-drag"><strong>{copy.product}</strong><small>{presentationCopy[language].lab}</small></div>
      <div className="moon-book-name"><small>{words.leaf}</small></div>
      <div className="moon-book-appearance no-drag">{extra}<MoonThemeSwitch language={language} /></div>
    </header>
    <nav className="moon-book-tabs no-drag" aria-label={words.chapters}>
      {chapters.filter(chapter => ["connection","browser","mcp"].includes(chapter.id)).map((chapter, index) => <button type="button" key={chapter.id} aria-current={surface === chapter.id ? "page" : undefined}
        onClick={() => navigate(chapter.id)}><small>{String(index + 1).padStart(2, "0")}</small><span>{chapter.title}</span></button>)}
    </nav>
    <div className="moon-book-volume">
      <div className="moon-book-pages">{children}</div>
    </div>
    <footer className="moon-book-colophon"><nav aria-label={copy.configuration}>{chapters.filter(chapter => ["setup","activity","settings"].includes(chapter.id)).map(chapter => <button type="button" key={chapter.id} aria-current={surface === chapter.id ? "page" : undefined} onClick={() => navigate(chapter.id)}>{chapter.title}</button>)}</nav><small>{String(page).padStart(2, "0")} / 06 · v{version}</small></footer>
  </main>;
}

export function MoonSignal({ result, reducedMotion }: { result: MoonConnectionResult; reducedMotion: boolean }) {
  const id = useId().replace(/:/g, "");
  const failed = result.state === "timeout" || result.state === "error";
  const sending = result.state === "sending";
  const ready = result.state === "ready";
  return <svg className="moon-signal" viewBox="0 0 600 390" fill="none" aria-hidden="true" data-state={result.state}>
    <defs>
      <linearGradient id={`${id}-moon`} x1="322" y1="100" x2="475" y2="254" gradientUnits="userSpaceOnUse"><stop stopColor="#fffcec"/><stop offset=".55" stopColor="#dad4f7"/><stop offset="1" stopColor="#9c8fcb"/></linearGradient>
      <radialGradient id={`${id}-aura`}><stop stopColor="#c5b3f3" stopOpacity=".28"/><stop offset="1" stopColor="#c5b3f3" stopOpacity="0"/></radialGradient>
      <mask id={`${id}-cut`}><circle cx="402" cy="164" r="76" fill="white"/><circle cx="429" cy="144" r="69" fill="black"/></mask>
    </defs>
    <motion.circle cx="402" cy="164" r="142" fill={`url(#${id}-aura)`} initial={false}
      animate={{ opacity: failed ? .18 : ready ? 1 : .42 }} transition={{duration:reducedMotion ? 0 : .85}} />
    <circle cx="402" cy="164" r="108" stroke="currentColor" strokeWidth=".55" opacity=".22"/>
    <path d="M 398 47 A 118 118 0 0 1 515 161" stroke="var(--moon-gold)" strokeWidth="1" opacity=".8"/>
    <motion.circle cx="402" cy="164" r="76" fill={`url(#${id}-moon)`} mask={`url(#${id}-cut)`} initial={false}
      animate={{opacity:failed ? .28 : ready ? 1 : .58}} transition={{duration:reducedMotion ? 0 : .8}} />
    <g stroke="var(--moon-gold)" strokeWidth=".8" opacity=".65">
      <path d="M 50 334 Q 238 355 355 236"/><path d="M 50 340 Q 234 384 367 245"/><path d="M 50 346 Q 239 412 379 251"/>
      <circle cx="50" cy="340" r="5"/><path d="M 25 368 H 125"/>
    </g>
    {sending && !reducedMotion ? <motion.circle r="3" fill="#f8e3ac" initial={{cx:50,cy:334,opacity:0}}
      animate={{cx:[50,170,278,355],cy:[334,326,291,236],opacity:[0,1,1,0]}} transition={{duration:1.1,ease:"easeInOut"}}/> : null}
    {ready && !reducedMotion ? [0,.18].map(delay => <motion.ellipse key={delay} cx="402" cy="164" rx="95" ry="80" stroke="#c9b6ee" strokeWidth="1.2"
      initial={{scale:.75,opacity:.55}} animate={{scale:1.6,opacity:0}} style={{transformOrigin:"402px 164px"}} transition={{duration:1.3,delay,ease:"easeOut"}} />) : null}
  </svg>;
}

export function MoonBrowserPreview({ language, copy }: { language: Language; copy: Copy }) {
  const words = moonBookCopy[language];
  const reducedMotion = useReducedMotionPreference();
  return <section className="moon-browser-preview"><BrowserConstellation status="loading" reducedMotion={reducedMotion} variant="browser"/><div className="moon-book-kicker">02 <i/> {words.book}</div>
    <h1>{copy.browser}</h1><p className="moon-preview-label">{words.demo}</p>
    <div className="moon-browser-paper"><div aria-hidden="true"><i/><i/><i/></div><span>chatgpt.com</span>
      <h2>{copy.stepAccount}</h2><p>{copy.stepAccountBody}</p><button type="button" className="button-primary" disabled>{copy.signIn}</button>
    </div>
  </section>;
}

export function MoonRouteGuide({ language, standalone = false, initialRoute = "fixed" }: { language: Language; standalone?: boolean; initialRoute?: "fixed" | "temporary" | "vps" }) {
  const words = moonBookCopy[language];
  const [route, setRoute] = useState(initialRoute);
  const content = <>
    <div className="moon-route-intro"><img src={cloudflareCloud} alt="Cloudflare"/><p>{words.routeIntro}</p></div>
    <small className="moon-route-status">{words.routeStatus}</small>
    <nav className="moon-route-choices" aria-label={words.routes}>{(["fixed","temporary","vps"] as const).map(key => <button key={key} type="button" aria-pressed={route === key} onClick={() => setRoute(key)}>{words[key]}</button>)}</nav>
    <div className="moon-route-options">
      <section key={route}><h3>{words[route]}</h3><p>{words[`${route}Body`]}</p></section>
    </div>
    <a href="https://developers.cloudflare.com/tunnel/" target="_blank" rel="noreferrer">{words.routeDocs} ↗</a>
  </>;
  return standalone ? <section className="moon-route-guide is-standalone"><h1>{words.routes}</h1>{content}</section>
    : <details className="moon-route-guide"><summary>{words.routes}</summary>{content}</details>;
}

export function MoonConnection({ language, preview, probe, onRepair, busy = false }: {
  language: Language; preview: boolean; probe: () => Promise<DoctorReport | MoonConnectionResult>; onRepair: () => void; busy?: boolean;
}) {
  const words = moonBookCopy[language];
  const reducedMotion = useReducedMotionPreference();
  const { theme } = useAppearance();
  const [leaf, setLeaf] = useState<"signal" | "repair" | "routes">("signal");
  const [direction, setDirection] = useState(1);
  const moveLeaf = (next: typeof leaf) => { setDirection(["signal","repair","routes"].indexOf(next) < ["signal","repair","routes"].indexOf(leaf) ? -1 : 1); setLeaf(next); };
  const [result, setResult] = useState<MoonConnectionResult>({state:"idle"});
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  useEffect(() => () => { generation.current += 1; if (timer.current) clearTimeout(timer.current); }, []);
  const run = async (demonstration?: "ready" | "timeout") => {
    if (running.current || busy) return;
    const current = ++generation.current;
    running.current = true;
    setAttempt(value => value + 1);
    setResult({state:"sending"});
    if (preview) {
      timer.current = setTimeout(() => {
        if (generation.current !== current) return;
        setResult(demonstration === "timeout" ? {state:"timeout",cause:"cloudflare"} : {state:"ready"});
        running.current = false;
      }, reducedMotion ? 0 : 1150);
      return;
    }
    try {
      const report = await probe();
      if (generation.current === current) setResult("checks" in report ? connectionFromDoctor(report) : report);
    } catch (error) {
      if (generation.current === current) setResult({state:/timeout|timed out|超时/i.test(String(error)) ? "timeout" : "error",cause:"unknown",detail:String(error)});
    } finally { if (generation.current === current) running.current = false; }
  };
  const failed = result.state === "timeout" || result.state === "error";
  const orange = failed && result.cause === "cloudflare";
  const status = result.state === "ready" ? words.success : failed ? words.failure
    : result.state === "sending" ? words.sending : result.state === "local-ready" ? words.localReady : words.idle;
  const repair = result.cause === "cloudflare" || result.cause === "tunnel" ? words.tunnelRepair
    : result.cause === "auth" ? words.authRepair : result.cause === "local" ? words.localRepair : words.unknownRepair;
  return <div className="moon-connection-page" data-preview={preview} data-leaf={leaf}>
    <AnimatePresence mode="wait" custom={direction} initial={false}>
    <motion.section className="moon-single-leaf" key={leaf} custom={direction} initial="enter" animate="present" exit="leave"
      variants={{enter:(d:number)=>({opacity:0,x:reducedMotion?0:d*54}),present:{opacity:1,x:0},leave:(d:number)=>({opacity:0,x:reducedMotion?0:-d*54})}}
      transition={{duration:reducedMotion?0:.36,ease:[.22,1,.36,1]}}>
    {leaf === "signal" ? <>
    <div className="original-connection-scene"><OnboardingScene stage="welcome" theme={theme} reducedMotion={reducedMotion} signal={result.state}/></div>
    <div className="moon-connection-spread">
      <section className="moon-connection-copy"><div className="moon-book-kicker">01 <i/> {words.book}</div><h1>{words.title}</h1><p>{words.intro}</p>
        <div className="moon-probe-state" role="status" aria-live="polite">
          {failed ? <p className="moon-dimmed-line">{words.dimmed}</p> : null}
          <h2>{status}</h2>
          {result.state === "ready" || failed ? <p>（{result.state === "ready" ? words.successDetail : result.state === "timeout" ? words.timeoutDetail : words.errorDetail}）</p> : null}
        </div>
        {preview ? <><p className="moon-preview-label">{words.demo}</p><div className="moon-probe-actions">
          <button className="button-primary" disabled={result.state === "sending"} onClick={() => void run("ready")}>{words.demoSuccess}</button>
          <button className="button-secondary" disabled={result.state === "sending"} onClick={() => void run("timeout")}>{words.demoTimeout}</button>
        </div></> : <><p className="moon-probe-scope">{words.scope}</p><button className="button-primary" disabled={busy || result.state === "sending"} onClick={() => void run()}>{words.check}</button></>}
      </section>
      <div className="moon-signal-stage compact-moon-signal" key={attempt}>
        <MoonSignal result={result} reducedMotion={reducedMotion}/>
        <div className="moon-string-label" aria-hidden="true">SIGNAL / MOON</div>
      </div>
    </div>
        <AnimatePresence>{orange ? <motion.div className="moon-orange-cloud" initial={{opacity:0,x:160,y:-28,rotate:-5}} animate={{opacity:1,x:0,y:0,rotate:0}}
          exit={{opacity:0,x:120}} transition={{duration:reducedMotion ? 0 : 1.2,delay:reducedMotion ? 0 : .55,ease:[.22,1,.36,1]}}>
          <img src={cloudflareCloud} alt="Cloudflare"/><motion.small initial={{opacity:0}} animate={{opacity:1}} transition={{delay:reducedMotion ? 0 : 1.8}}>{words.orange}</motion.small>
        </motion.div> : null}</AnimatePresence>
    <footer className="moon-leaf-navigation"><button className="text-button" type="button" onClick={() => moveLeaf("routes")}>{words.routes} ↗</button>
      {failed ? <button className="button-primary" type="button" onClick={() => moveLeaf("repair")}>{words.repair} →</button> : null}</footer>
    </> : leaf === "repair" ? <>
    <div className="moon-leaf-scroll"><section className="moon-repair-leaf" aria-label={words.repair}>
      <small>02 / {words.book}</small><h1>{words.repair}</h1><p>{repair}</p>
      {result.detail ? <details><summary>{words.details}</summary><pre>{result.detail}</pre></details> : null}
      <button className="text-button" onClick={onRepair}>{words.configure} ↗</button>
    </section></div>
    <footer className="moon-leaf-navigation"><button className="text-button" type="button" onClick={() => moveLeaf("signal")}>← {copyFor(language).previous}</button><button className="button-primary" type="button" onClick={() => moveLeaf("routes")}>{words.routes} →</button></footer>
    </> : <><div className="moon-leaf-scroll"><MoonRouteGuide language={language} standalone/></div>
    <footer className="moon-leaf-navigation"><button className="text-button" type="button" onClick={() => moveLeaf(failed ? "repair" : "signal")}>← {copyFor(language).previous}</button><button className="button-primary" type="button" onClick={onRepair}>{words.configure} →</button></footer></>}
    </motion.section></AnimatePresence>
  </div>;
}
