import { motion } from "motion/react";
import { createContext, useContext, useId } from "react";
import type { Language, MoonTheme } from "./types";
import { useReducedMotionPreference } from "./useReducedMotionPreference";

export const moonCopy: Record<Language, { label: string; light: string; dark: string; hint: string; toLight: string; toDark: string }> = {
  "zh-CN": { label: "月色", light: "明月", dark: "暗月", hint: "轻触月亮，让云来，或让云散。你的月色会被记住。", toLight: "云散，切换到明月", toDark: "云来，切换到暗月" },
  "zh-Hant": { label: "月色", light: "明月", dark: "暗月", hint: "輕觸月亮，讓雲來，或讓雲散。你的月色會被記住。", toLight: "雲散，切換到明月", toDark: "雲來，切換到暗月" },
  en: { label: "Moonlight", light: "Bright Moon", dark: "Dark Moon", hint: "Touch the moon to welcome the cloud or let it drift away. Your palette is remembered.", toLight: "Clear the cloud and switch to Bright Moon", toDark: "Welcome the cloud and switch to Dark Moon" },
  fr: { label: "Clair de lune", light: "Lune claire", dark: "Lune sombre", hint: "Touchez la lune pour accueillir le nuage ou le laisser partir. Votre choix est conservé.", toLight: "Écarter le nuage et passer à la Lune claire", toDark: "Accueillir le nuage et passer à la Lune sombre" },
  ja: { label: "月の彩り", light: "明月", dark: "暗月", hint: "月に触れると、雲が訪れたり晴れたりします。月の彩りは保存されます。", toLight: "雲を晴らして明月に切り替える", toDark: "雲を迎えて暗月に切り替える" },
  ru: { label: "Лунный свет", light: "Светлая луна", dark: "Тёмная луна", hint: "Коснитесь луны, чтобы облако пришло или уплыло. Ваш выбор сохраняется.", toLight: "Убрать облако и включить Светлую луну", toDark: "Пригласить облако и включить Тёмную луну" },
  de: { label: "Mondlicht", light: "Heller Mond", dark: "Dunkler Mond", hint: "Berühre den Mond, damit die Wolke kommt oder weiterzieht. Deine Auswahl wird gespeichert.", toLight: "Die Wolke ziehen lassen und zum hellen Mond wechseln", toDark: "Die Wolke begrüßen und zum dunklen Mond wechseln" },
};

type Appearance = { theme: MoonTheme; busy: boolean; changeTheme: (theme: MoonTheme) => Promise<void> };
export const AppearanceContext = createContext<Appearance>({ theme: "light", busy: false, changeTheme: async () => {} });
export const useAppearance = () => useContext(AppearanceContext);

export function MoonThemeSwitch({ language }: { language: Language }) {
  const { theme, busy, changeTheme } = useAppearance();
  const copy = moonCopy[language];
  const descriptionId = useId();
  const reducedMotion = useReducedMotionPreference();
  const dark = theme === "dark";
  const description = `${copy[theme]} · ${dark ? copy.toLight : copy.toDark}`;
  return <button className="moon-theme-switch no-drag" type="button" role="switch" aria-label={copy.label}
    aria-checked={dark} aria-describedby={descriptionId} aria-busy={busy} disabled={busy} title={description}
    data-moon={theme} data-reduced-motion={reducedMotion} onClick={() => void changeTheme(dark ? "light" : "dark")}>
    <MoonWeatherGlyph theme={theme} reducedMotion={reducedMotion} />
    <span className="moon-theme-description" id={descriptionId}>{description}</span>
  </button>;
}

const crescent = "M 48 12 C 36 9 22 17 20 31 C 17 47 29 60 44 60 C 54 60 64 54 69 45 C 53 51 39 42 37 30 C 35 22 40 15 48 12 Z";

// Code-native artwork: one moon, one passing cloud, no toggle track or ripple.
// The saved theme is the only source of truth, including after a failed write.
export function MoonWeatherGlyph({ theme, reducedMotion }: { theme: MoonTheme; reducedMotion: boolean }) {
  const id = useId().replace(/:/g, "");
  const dark = theme === "dark";
  const drift = { duration: reducedMotion ? 0 : .85, ease: [.22, 1, .36, 1] as const };
  const moonlight = { duration: reducedMotion ? 0 : .65, delay: reducedMotion ? 0 : .12 };
  return <svg className="moon-weather-glyph" viewBox="0 0 88 72" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-bright`} x1="30" y1="12" x2="60" y2="60" gradientUnits="userSpaceOnUse"><stop stopColor="#fffef5" /><stop offset=".55" stopColor="#fff2ca" /><stop offset="1" stopColor="#cfb983" /></linearGradient>
      <linearGradient id={`${id}-night`} x1="29" y1="15" x2="57" y2="60" gradientUnits="userSpaceOnUse"><stop stopColor="#d2e7ff" /><stop offset=".5" stopColor="#b4b1f0" /><stop offset="1" stopColor="#a17fd5" /></linearGradient>
      <linearGradient id={`${id}-cloud`} x1="42" y1="33" x2="60" y2="57" gradientUnits="userSpaceOnUse"><stop stopColor="#626381" /><stop offset=".5" stopColor="#424562" /><stop offset="1" stopColor="#292f4f" /></linearGradient>
      <filter id={`${id}-haze`} x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="4.5" /></filter>
    </defs>
    <motion.path className="moon-weather-glow" d={crescent} filter={`url(#${id}-haze)`} initial={false}
      animate={{ fill: dark ? "#aea0ff" : "#c6a66b", opacity: dark ? .5 : .32 }} transition={moonlight} />
    <path className="moon-weather-crescent" d={crescent} fill={`url(#${id}-bright)`} stroke="#ccb98b" strokeWidth=".6" />
    <motion.path className="moon-weather-night" d={crescent} fill={`url(#${id}-night)`} stroke="#c3b2ee" strokeWidth=".6"
      initial={false} animate={{ opacity: dark ? 1 : 0 }} transition={moonlight} />
    <motion.g className="moon-weather-cloud" initial={false} animate={{ x: dark ? -3 : 24, y: dark ? -3 : -9, opacity: dark ? 1 : 0 }} transition={drift}>
      <path d="M 41 56 C 36 56 32 53 32 48 C 32 44 35 40 40 40 C 41 34 47 31 52 33 C 57 33 61 37 61 42 C 67 40 74 44 74 49 C 74 54 70 58 65 58 H 44 C 43 58 42 57 41 56 Z" fill={`url(#${id}-cloud)`} />
      <path d="M 40 40 C 42 34 47 32 52 34 C 56 34 59 37 60 41" stroke="#aa9fca" strokeWidth=".7" opacity=".6" strokeLinecap="round" />
    </motion.g>
    <motion.path d="M 66 12 L 67 15 L 70 16 L 67 17 L 66 20 L 65 17 L 62 16 L 65 15 Z" initial={false}
      animate={{ fill: dark ? "#c9b8ef" : "#c5ab70", opacity: dark ? .75 : .45 }} transition={moonlight} />
  </svg>;
}
