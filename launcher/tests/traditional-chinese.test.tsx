import { expect, test } from "bun:test";
import { copyFor } from "../src/i18n";
import { zhHant } from "../src/locales/zh-Hant";
import { detectLanguage, welcomeCopy } from "../src/welcome-copy";
import { onboardingLanguages, languageFromKey, presentationCopy } from "../src/onboarding-presentation";
import { journeyCopy } from "../src/journey-copy";
import { moonBookCopy } from "../src/moon-book-copy";
import { assistanceCopy, assistanceStateCopy } from "../src/setup-assistance-copy";
import { moonCopy } from "../src/appearance";
import { previewCopy } from "./preview-copy";

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Object.values(value as Record<string, unknown>).flatMap(strings);
}
const technicalText = (value: string) => value.replace(/[^\x21-\x7e]/g, "");

test("Traditional Chinese has its own complete UI dictionary, not an English or Simplified fallback", () => {
  expect(copyFor("zh-Hant")).toBe(zhHant);
  expect(copyFor("zh-Hant")).not.toBe(copyFor("zh-CN"));
  expect(Object.keys(zhHant).sort()).toEqual(Object.keys(copyFor("en")).sort());
  expect(Object.keys(zhHant).length).toBeGreaterThan(150);
  for (const [key, value] of Object.entries(zhHant)) {
    expect(value.trim().length).toBeGreaterThan(0);
    expect(value).not.toMatch(/TODO|TRANSLATE_ME/);
    if (key !== "chinese") expect(value).not.toMatch(/登录|设置|运行|连接|密钥|网页|简体|默认|账号|验证|安装|启动/);
    expect(technicalText(value)).toBe(technicalText(copyFor("zh-CN")[key as keyof typeof zhHant]));
  }
  expect(zhHant.product).toBe("星月計畫");
  expect(zhHant.traditionalChinese).toBe("繁體中文");
  expect(zhHant.chinese).toBe("简体中文");
  expect(zhHant.native2Title).toBe("Native2 · 進階工具回傳");
  expect(zhHant.mcpStepTwoBody).toContain("金鑰");
  expect(zhHant.restartCodex).toContain("完全結束 Codex");
  expect(zhHant.uninstallIntegration).toBe("移除 Codex 整合");
});

test("Traditional Chinese covers every welcome, journey, guide, connection, appearance and preview table", () => {
  const tables = [welcomeCopy, presentationCopy, journeyCopy, moonBookCopy, assistanceCopy, assistanceStateCopy, moonCopy, previewCopy];
  for (const table of tables) {
    const translated = table["zh-Hant"], simplified = table["zh-CN"];
    expect(Object.keys(translated).sort()).toEqual(Object.keys(table.en).sort());
    expect(strings(translated).length).toBe(strings(simplified).length);
    strings(translated).forEach((value, index) => {
      expect(value.trim()).not.toBe("");
      expect(value).not.toMatch(/TODO|TRANSLATE_ME|登录|设置|运行|连接|密钥|网页|默认|账号|验证|安装|启动/);
      expect(technicalText(value)).toBe(technicalText(strings(simplified)[index]!));
    });
  }
  expect(presentationCopy["zh-Hant"].lab).toBe("南極星實驗室");
  expect(assistanceCopy["zh-Hant"].addressHelp).toContain("http://127.0.0.1:8765/mcp");
  expect(assistanceCopy["zh-Hant"].addressHelp).toContain("/mcp、/register、/oauth/* 和 /.well-known/*");
  expect(assistanceCopy["zh-Hant"].webStepThree).toContain("agentdock_context");
  expect(previewCopy["zh-Hant"].farewell).toBe("願星光與你同行，我們下次再會");
  expect(previewCopy["zh-Hant"].confirm).toBe("確認解除安裝");
});

test("Taiwan, Hong Kong, Macao and explicit Hant locales select canonical zh-Hant", () => {
  for (const locale of ["zh-TW", "zh-HK", "zh-MO", "zh-Hant", "zh-Hant-TW", "zh-Hant-HK", "zh-Hant-MO",
    "zh_Hant_TW", "zh_HK", "zh_mo", "ZH-TW", " zh-Hant ", "zh-TW-u-nu-hanidec", "zh-Hant-CN"]) {
    expect(detectLanguage(locale)).toBe("zh-Hant");
  }
});

test("explicit Hans and mainland/general Chinese remain Simplified while other locale fallbacks survive", () => {
  for (const locale of ["zh", "zh-CN", "zh-SG", "zh-Hans", "zh-Hans-CN", "zh_Hans", "zh-Hans-TW", "zh-Hans-HK"]) {
    expect(detectLanguage(locale)).toBe("zh-CN");
  }
  for (const [locale, expected] of [["ja_JP", "ja"], ["fr-CA", "fr"], ["ru-RU", "ru"], ["de-AT", "de"], ["en-HK", "en"], ["es-ES", "en"], ["", "en"]]) {
    expect(detectLanguage(locale!)).toBe(expected);
  }
});

test("language selection starts Simplified then Traditional with stable directional keyboard navigation", () => {
  expect(onboardingLanguages.map(option => option.value)).toEqual(["zh-CN", "zh-Hant", "en", "fr", "ja", "ru", "de"]);
  expect(onboardingLanguages[1]).toEqual({ value: "zh-Hant", label: "繁體中文", marker: "繁" });
  expect(languageFromKey("zh-CN", "ArrowRight")).toBe("zh-Hant");
  expect(languageFromKey("zh-Hant", "ArrowRight")).toBe("en");
  expect(languageFromKey("zh-Hant", "ArrowLeft")).toBe("zh-CN");
  expect(languageFromKey("zh-Hant", "Home")).toBe("zh-CN");
  expect(languageFromKey("zh-Hant", "End")).toBe("de");
});
