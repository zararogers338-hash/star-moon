import { motion } from "motion/react";
import { useId } from "react";
import { onboardingScenes, type OnboardingStage } from "./onboarding-presentation";
import type { MoonTheme } from "./types";
import type { MoonConnectionState } from "./moon-connection";

export function OnboardingScene({ stage, reducedMotion, direction = 1, theme = "light", signal }: { stage: OnboardingStage; reducedMotion: boolean; direction?: number; theme?: MoonTheme; signal?: MoonConnectionState }) {
  const scene = onboardingScenes[stage];
  const id = useId().replace(/:/g, "");
  const transition = { duration: reducedMotion ? 0 : 1.2, ease: [0.22, 1, 0.36, 1] as const };
  const dark = theme === "dark";
  return (
    <div className="welcome-art" aria-hidden="true" data-scene={stage} data-direction={direction} data-moon={theme} data-signal={signal}>
      <svg className="welcome-art-canvas" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
          <linearGradient id={`${id}-trail`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#c1afe1" /><stop offset=".5" stopColor="#fffdf2" /><stop offset="1" stopColor="#e4c98d" /></linearGradient>
          <radialGradient id={`${id}-light`} cx="32%" cy="24%" r="82%">
            <stop offset="0" stopColor="#fffdf7" /><stop offset="1" stopColor="#e3dfef" />
          </radialGradient>
          <mask id={`${id}-moon`} maskUnits="userSpaceOnUse" x="-102" y="-102" width="204" height="204">
            <circle r="100" fill="white" />
            <motion.circle r="90" fill="black" initial={false} animate={{ cx: scene.moonX, cy: scene.moonY }} transition={transition} />
          </mask>
        </defs>
        <motion.rect width="1440" height="900" initial={false} animate={{ fill: dark ? "#12152e" : scene.ink }} transition={transition} />
        <motion.path initial={false} animate={{ d: scene.veil, fill: dark ? "#4a416e" : scene.lavender }} transition={transition} opacity=".88" />
        <motion.path initial={false} animate={{ d: scene.paper, fill: dark ? "#20243d" : "#faf9f5" }} transition={transition} />
        <motion.g initial={false} animate={{ rotate: scene.arcRotation }} transition={transition} style={{ transformOrigin: "720px 450px" }}>
          <ellipse cx="-72" cy="-94" rx="938" ry="929" fill="none" stroke={dark ? "#b5a2dc" : "#a68d56"} strokeWidth=".8" opacity=".55" />
          <ellipse cx="1210" cy="397" rx="423" ry="695" fill="none" stroke="#c5ae78" strokeWidth=".8" opacity=".75" transform="rotate(38 1210 397)" />
        </motion.g>
        {signal ? <g fill="none" stroke="#cbb47d" strokeWidth="1" opacity=".8">
          <path d="M 775 746 Q 961 742 1060 531"/><path d="M 775 755 Q 976 776 1074 538"/><path d="M 775 764 Q 989 808 1087 544"/>
          {signal === "sending" && !reducedMotion ? <motion.circle r="4" fill="#fff0c5" initial={{cx:775,cy:746,opacity:0}} animate={{cx:[775,895,1010,1060],cy:[746,705,615,531],opacity:[0,1,1,0]}} transition={{duration:1.1,ease:"easeInOut"}}/> : null}
        </g> : null}
        <g transform="translate(1090 438)">
          <motion.g initial={false} animate={{ rotate: scene.rotation, scale: scene.spread }} transition={transition}>
            <ellipse rx="178" ry="259" fill="none" stroke="#eee7da" strokeWidth=".85" opacity=".78" />
            <ellipse rx="263" ry="149" fill="none" stroke="#cdb780" strokeWidth="1" opacity=".88" transform="rotate(-24)" />
            <ellipse rx="190" ry="281" fill="none" stroke="#f5f0e7" strokeWidth=".6" opacity=".24" />
            <circle cx="0" cy="-259" r="4" fill="#f6f1e6" />
            <circle cx="-235" cy="-15" r="3" fill="#d7bd85" />
            <circle cx="164" cy="102" r="2.5" fill="#f6f1e6" />
            {!reducedMotion ? <g key={stage} className="welcome-trails" fill="none" strokeLinecap="round">
              <path className="welcome-light-trail welcome-trail-halo" d="M 0 -259 A 178 259 0 0 1 0 259 A 178 259 0 0 1 0 -259" pathLength="1" stroke={`url(#${id}-trail)`} strokeWidth="9" filter={`url(#${id}-glow)`} />
              <path className="welcome-light-trail" d="M 0 -259 A 178 259 0 0 1 0 259 A 178 259 0 0 1 0 -259" pathLength="1" stroke="#fffbee" strokeWidth="1.9" />
              <g transform="rotate(-24)">
                <path className="welcome-light-trail welcome-trail-second welcome-trail-halo" d="M 263 0 A 263 149 0 0 1 -263 0 A 263 149 0 0 1 263 0" pathLength="1" stroke="#f7dda3" strokeWidth="7" filter={`url(#${id}-glow)`} />
                <path className="welcome-light-trail welcome-trail-second" d="M 263 0 A 263 149 0 0 1 -263 0 A 263 149 0 0 1 263 0" pathLength="1" stroke="#ffe7b7" strokeWidth="1.5" />
              </g>
            </g> : null}
          </motion.g>
          <motion.circle r="100" fill={`url(#${id}-light)`} mask={`url(#${id}-moon)`} initial={false}
            animate={{opacity:signal === "timeout" || signal === "error" ? .32 : signal === "idle" || signal === "sending" ? .72 : 1}}
            transition={{duration:reducedMotion ? 0 : .8}} />
          {signal === "ready" && !reducedMotion ? [0,.18].map(delay => <motion.circle key={delay} r="100" fill="none" stroke="#ece1ff" strokeWidth="1.2" initial={{scale:.8,opacity:.55}} animate={{scale:1.75,opacity:0}} transition={{duration:1.3,delay}}/>) : null}
          <circle r="123" fill="none" stroke="#f5f0e7" strokeWidth=".6" opacity=".22" />
        </g>
        <motion.g initial={false} animate={{ x: scene.starX, y: scene.starY }} transition={transition}>
          <path d="M 0 -29 C 3 -7 7 -3 29 0 C 7 3 3 7 0 29 C -3 7 -7 3 -29 0 C -7 -3 -3 -7 0 -29 Z" fill="#fffaf0" />
        </motion.g>
        <path d="M 1280 191 v 38 M 1261 210 h 38" stroke="#d8caa4" strokeWidth=".8" />
        <circle cx="976" cy="708" r="2" fill="#fbf7ee" />
        <circle cx="989" cy="708" r="1.3" fill="#fbf7ee" />
      </svg>
    </div>
  );
}

export function AntarcticStar() {
  return <svg className="antarctic-star" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 1C18 12 20 14 31 16C20 18 18 20 16 31C14 20 12 18 1 16C12 14 14 12 16 1Z" fill="currentColor" /></svg>;
}
