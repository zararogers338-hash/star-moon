import type { Language } from "./types";

export const CHAT_ON_STEROIDS_REPOSITORY = "https://github.com/totec448-spec/chat-on-steroids";
export const CHAT_ON_STEROIDS_VERSION = "2.0.6";
export const CHAT_ON_STEROIDS_EXTENSION_URL = `${CHAT_ON_STEROIDS_REPOSITORY}/releases/download/v${CHAT_ON_STEROIDS_VERSION}/Chat-On-Steroids-Extension.zip`;

export interface CompanionExtensionCopy {
  title: string;
  body: string;
  install: string;
}

export const companionExtensionCopy: Record<Language, CompanionExtensionCopy> = {
  en: {
    title: "Chat On Steroids browser companion",
    body: "Optional upstream companion for a normal Chrome/Chromium profile. Download it, load the unpacked folder in chrome://extensions, then keep using an ordinary ChatGPT conversation.",
    install: "Download companion v2.0.6",
  },
  "zh-CN": {
    title: "Chat On Steroids 浏览器伴侣",
    body: "可选的上游浏览器伴侣，面向普通 Chrome/Chromium 配置。下载后在 chrome://extensions 中加载解压文件夹，并始终使用普通 ChatGPT 对话。",
    install: "下载伴侣 v2.0.6",
  },
  "zh-Hant": {
    title: "Chat On Steroids 瀏覽器伴侶",
    body: "可選的上游瀏覽器伴侶，面向一般 Chrome/Chromium 設定。下載後在 chrome://extensions 載入解壓資料夾，並始終使用一般 ChatGPT 對話。",
    install: "下載伴侶 v2.0.6",
  },
  ja: {
    title: "Chat On Steroids ブラウザー companion",
    body: "通常の Chrome/Chromium プロファイル用の任意の上流 companion です。ダウンロードして chrome://extensions で展開フォルダーを読み込み、通常の ChatGPT 会話を使ってください。",
    install: "companion v2.0.6 をダウンロード",
  },
  fr: {
    title: "Compagnon navigateur Chat On Steroids",
    body: "Compagnon amont facultatif pour un profil Chrome/Chromium normal. Téléchargez-le, chargez le dossier décompressé dans chrome://extensions et gardez une conversation ChatGPT ordinaire.",
    install: "Télécharger le compagnon v2.0.6",
  },
  ru: {
    title: "Браузерный companion Chat On Steroids",
    body: "Необязательный upstream-companion для обычного профиля Chrome/Chromium. Скачайте его, загрузите распакованную папку в chrome://extensions и используйте обычный разговор ChatGPT.",
    install: "Скачать companion v2.0.6",
  },
  de: {
    title: "Chat-On-Steroids-Browser-Begleiter",
    body: "Optionaler Upstream-Begleiter für ein normales Chrome/Chromium-Profil. Herunterladen, den entpackten Ordner unter chrome://extensions laden und eine normale ChatGPT-Unterhaltung verwenden.",
    install: "Begleiter v2.0.6 herunterladen",
  },
};
