import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingScene } from "../src/OnboardingScene";
import { AppearanceContext, MoonThemeSwitch, MoonWeatherGlyph, moonCopy } from "../src/appearance";
import { FirstRunJourney } from "../src/FirstRunJourney";
import { journeyChapters } from "../src/configuration-journey";
import type { LauncherApi, LauncherSnapshot } from "../src/types";
import { previewCopy } from "./preview-copy";
import { copyFor } from "../src/i18n";
import { languageFromKey, onboardingLanguages, onboardingScenes, presentationCopy, type OnboardingStage } from "../src/onboarding-presentation";

test("Star & Moon presentation has complete seven-language branding and chapter copy", () => {
  expect(onboardingLanguages).toHaveLength(7);
  expect(copyFor("zh-CN").product).toBe("星月计划");
  for (const { value: language } of onboardingLanguages) {
    const copy = presentationCopy[language];
    expect(Object.keys(copy).sort()).toEqual(Object.keys(presentationCopy.en).sort());
    for (const text of [...Object.values(copy).filter(value => typeof value === "string"), ...Object.values(copy.chapters)]) {
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toMatch(/TODO|TRANSLATE_ME/);
    }
    expect(copyFor(language).product).not.toBe("Codex Web GPT");
  }
});

test("each chapter has a different but morph-compatible composition", () => {
  const scenes = Object.values(onboardingScenes);
  for (const key of ["paper", "veil"] as const) {
    expect(new Set(scenes.map(scene => scene[key])).size).toBe(4);
    const commands = scenes.map(scene => scene[key].match(/[a-z]/gi)?.join(""));
    expect(new Set(commands).size).toBe(1);
  }
  expect(new Set(scenes.map(scene => scene.rotation)).size).toBe(4);
});

test("reduced motion omits light trails; scenes use no network or reference illustration", () => {
  for (const stage of Object.keys(onboardingScenes) as OnboardingStage[]) {
    const still = renderToStaticMarkup(<OnboardingScene stage={stage} reducedMotion />);
    const moving = renderToStaticMarkup(<OnboardingScene stage={stage} reducedMotion={false} direction={-1} />);
    expect(still).not.toContain("welcome-light-trail");
    expect(moving).toContain("welcome-light-trail");
    expect(moving).toContain('data-direction="-1"');
    expect(still).toContain('aria-hidden="true"');
    expect(moving).not.toMatch(/<image|<script|<foreignObject|https?:\/\//);
  }
});

test("orbital mask ids stay unique with multiple scene instances", () => {
  const html = renderToStaticMarkup(<><OnboardingScene stage="welcome" reducedMotion /><OnboardingScene stage="language" reducedMotion /></>);
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), match => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
});

test("light trails are finite and obey reduced-motion preferences", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const trailRule = css.match(/\.welcome-light-trail\s*\{([^}]+)\}/)?.[1] ?? "";
  expect(trailRule).toContain("stellar-travel");
  expect(trailRule).not.toContain("infinite");
  expect(css).toContain("prefers-reduced-motion: reduce");
  expect(css).toContain("animation: none !important");
  expect(css).toContain('.welcome-art[data-direction="-1"]');
});

test("language radios support directional keys, wrapping, Home and End", () => {
  expect(languageFromKey("zh-CN", "ArrowRight")).toBe("zh-Hant");
  expect(languageFromKey("zh-CN", "ArrowLeft")).toBe("de");
  expect(languageFromKey("de", "ArrowDown")).toBe("zh-CN");
  expect(languageFromKey("en", "ArrowUp")).toBe("zh-Hant");
  expect(languageFromKey("ru", "Home")).toBe("zh-CN");
  expect(languageFromKey("ru", "End")).toBe("de");
  expect(languageFromKey("en", "Enter")).toBeNull();
});

test("both moon themes share composition and provide accessible seven-language controls", () => {
  for (const { value: language } of onboardingLanguages) {
    expect(Object.keys(moonCopy[language]).sort()).toEqual(Object.keys(moonCopy.en).sort());
    for (const text of Object.values(moonCopy[language])) expect(text.trim()).not.toBe("");
    for (const theme of ["light", "dark"] as const) {
      const html = renderToStaticMarkup(<AppearanceContext.Provider value={{ theme, busy: false, changeTheme: async () => {} }}><MoonThemeSwitch language={language} /></AppearanceContext.Provider>);
      expect(html).toContain(`aria-label="${moonCopy[language].label}"`);
      expect(html.match(/role="switch"/g)).toHaveLength(1);
      expect(html.match(/<button\b/g)).toHaveLength(1);
      expect(html).toContain(`aria-checked="${theme === "dark"}"`);
      expect(html).toContain("aria-describedby=");
      expect(html).not.toContain("aria-pressed");
      expect(html).toContain(moonCopy[language][theme]);
    }
  }
  for (const stage of Object.keys(onboardingScenes) as OnboardingStage[]) {
    const light = renderToStaticMarkup(<OnboardingScene stage={stage} reducedMotion theme="light" />);
    const dark = renderToStaticMarkup(<OnboardingScene stage={stage} reducedMotion theme="dark" />);
    expect(dark).toContain('data-moon="dark"');
    expect(dark).toContain("#20243d");
    expect(light).toContain("#faf9f5");
    expect([...dark.matchAll(/\bd="([^"]+)"/g)].map(match => match[1])).toEqual([...light.matchAll(/\bd="([^"]+)"/g)].map(match => match[1]));
  }
});

test("borderless weather control shows one crescent and a drifting half-cover cloud", () => {
  const light = renderToStaticMarkup(<MoonWeatherGlyph theme="light" reducedMotion={false} />);
  const dark = renderToStaticMarkup(<MoonWeatherGlyph theme="dark" reducedMotion={false} />);
  const still = renderToStaticMarkup(<MoonWeatherGlyph theme="dark" reducedMotion />);
  const cloud = (html: string) => html.match(/class="moon-weather-cloud"[^>]*/)?.[0] ?? "";
  expect(cloud(light)).toContain('opacity="0"');
  expect(cloud(dark)).toContain('opacity="1"');
  expect(cloud(still)).toBe(cloud(dark));
  expect(light).toContain("moon-weather-crescent");
  expect(dark).toContain("moon-weather-night");
  expect(dark).not.toMatch(/<image|<script|<foreignObject|https?:\/\//);
  const multiple = renderToStaticMarkup(<><MoonWeatherGlyph theme="light" reducedMotion /><MoonWeatherGlyph theme="dark" reducedMotion /></>);
  const ids = [...multiple.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
  const css = readFileSync(new URL("../src/star-moon.css", import.meta.url), "utf8");
  const rule = css.match(/^\.moon-theme-switch\s*\{([^}]+)\}/m)?.[1] ?? "";
  expect(rule).toContain("border: 0");
  expect(rule).toContain("background: transparent");
  expect(rule).not.toContain("animation:");
  expect(css).not.toContain(".moon-theme-symbol");
});

test("saving the appearance disables the one control without changing its displayed theme", () => {
  const html = renderToStaticMarkup(<AppearanceContext.Provider value={{ theme: "light", busy: true, changeTheme: async () => {} }}><MoonThemeSwitch language="zh-CN" /></AppearanceContext.Provider>);
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('disabled=""');
  expect(html).toContain('aria-checked="false"');
  expect(html).toContain("云来，切换到暗月");
});

test("selective feature names retain clear functional subtitles and the requested poem", () => {
  const zh = copyFor("zh-CN");
  expect(zh.biggerContext).toBe("永夜");
  expect(zh.biggerContextRecommendationTitle).toBe("永夜");
  expect(zh.biggerContextTagline).toBe("月亮似乎永远也不会落下");
  expect(zh.biggerContextSubtitle).toBe("实验性 · 开启 3× Chat 上下文");
  expect(zh.biggerContextSubtitle).not.toMatch(/额度|用量/);
  expect(zh.biggerContextBody).toContain("不增加账号用量额度");
  expect(zh.biggerContextRecommendationBody).toContain("不增加账号用量额度");
  expect(zh.biggerContextBody).toContain("默认关闭");
  expect(zh.keepRunningOnClose).toBe("守夜");
  expect(zh.keepRunningOnCloseSubtitle).toContain("后台运行");
  expect(zh.diagnostics).toBe("诊断");
  expect(zh.cancelTurns).toContain("取消");
  for (const { value: language } of onboardingLanguages) {
    const copy = copyFor(language);
    expect(copy.biggerContextRecommendationTitle).toBe(copy.biggerContext);
    expect(copy.biggerContextTagline.trim().length).toBeGreaterThan(0);
    expect(copy.biggerContextSubtitle).toContain("3×");
    expect(copy.keepRunningOnCloseSubtitle).not.toBe(copy.keepRunningOnClose);
  }
});

test("Endless Night presents title, poem, then the experimental context caption", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const header = app.match(/<header className="bigger-context-recommendation-header">([\s\S]*?)<\/header>/)?.[1] ?? "";
  const title = header.indexOf("copy.biggerContextRecommendationTitle");
  const poem = header.indexOf("copy.biggerContextTagline");
  const caption = header.indexOf("copy.biggerContextSubtitle");
  expect(title).toBeGreaterThanOrEqual(0);
  expect(poem).toBeGreaterThan(title);
  expect(caption).toBeGreaterThan(poem);
});

test("poetic mode names have a factual subtitle and retain operational cautions", () => {
  const zh = copyFor("zh-CN");
  expect(zh.automaticInteraction).toBe("皎洁之明月");
  expect(zh.manualInteraction).toBe("新生之幼月");
  expect(zh.automaticInteractionSubtitle).toBe("自动化模式");
  expect(zh.manualInteractionSubtitle).toBe("手动协作模式");
  expect(zh.automaticInteractionBody).toContain("OpenAI");
  expect(zh.manualInteractionBody).toContain("自行粘贴并发送");
  for (const { value: language } of onboardingLanguages) {
    const copy = copyFor(language);
    expect(copy.automaticInteractionSubtitle.trim().length).toBeGreaterThan(0);
    expect(copy.manualInteractionSubtitle.trim().length).toBeGreaterThan(0);
    expect(copy.automaticInteraction).not.toBe(copy.automaticInteractionSubtitle);
    expect(copy.manualInteraction).not.toBe(copy.manualInteractionSubtitle);
  }
});

test("welcome and configuration wordmarks omit the star without removing scene artwork", () => {
  for (const file of ["App.tsx", "FirstRunJourney.tsx"]) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
    const brand = source.match(/<div className="welcome-brand[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? "";
    expect(brand.length).toBeGreaterThan(0);
    expect(brand).not.toContain("AntarcticStar");
    expect(brand).toContain("presentation.lab");
    expect(source).toContain("<OnboardingScene");
  }
});

test("isolated preview provides a next button without authentication or runtime calls", () => {
  const snapshot = { state: { browserInteractionMode: "automatic" }, browser: { authenticated: false },
    connectorNames: { automatic: "PREVIEW ONLY", manual: "PREVIEW ONLY" }, urls: {}, version: "preview", mcpCredentialsConfigured: false } as LauncherSnapshot;
  const api = new Proxy({}, { get: () => () => { throw new Error("No runtime calls allowed in preview rendering"); } }) as LauncherApi;
  const shared = { api, browser: snapshot.browser, language: "zh-CN" as const, operation: null, refresh: async () => snapshot, snapshot, updateState: () => {} };
  const html = renderToStaticMarkup(<FirstRunJourney {...shared} preview={{ copyFor: language => previewCopy[language], finish: () => {} }} />);
  expect(html).toContain('data-preview="true"');
  expect(html).toContain("继续预览");
  expect(html).toContain("无需登录或填写密钥");
  expect(html).not.toContain("journey-browser-panel");
  const live = renderToStaticMarkup(<FirstRunJourney {...shared} />);
  expect(live).toContain('data-preview="false"');
  expect(live).not.toContain("继续预览");
  expect(live).toContain(copyFor("zh-CN").signIn);
});

test("preview traversal includes AgentDock and Endless Night before entry", () => {
  expect(journeyChapters("automatic")).toEqual(["account", "prepare", "smoke", "install", "catalog", "tunnel", "credentials", "connector", "verify", "agentdock", "endless-night", "complete"]);
  expect(journeyChapters("manual")).toEqual(["tunnel", "credentials", "catalog", "connector", "verify", "agentdock", "endless-night", "complete"]);
  const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  expect(main).toContain("<App />");
  expect(main).not.toContain("journeyPreview");
  const fixture = readFileSync(new URL("./ui-preview.ts", import.meta.url), "utf8");
  expect(fixture).toContain("journeyPreview:");
  expect(fixture).toContain("runtime actions are disabled");
  expect(fixture).not.toMatch(/(?:authenticated|smokePassed|mcpSetupComplete|coreSetupComplete|codexCatalogVerified)\s*:\s*true/);
});

test("preview copy and farewell remain complete in seven languages", () => {
  for (const { value: language } of onboardingLanguages) {
    expect(Object.keys(previewCopy[language]).sort()).toEqual(Object.keys(previewCopy.en).sort());
    for (const value of Object.values(previewCopy[language])) expect(value.trim()).not.toBe("");
  }
  expect(previewCopy["zh-CN"].farewell).toBe("愿星光与你同行，我们下次再会");
  expect(previewCopy["zh-CN"].confirm).toBe("确认卸载");
  expect(previewCopy["zh-CN"].cancel).toBe("取消卸载");
});
