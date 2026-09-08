import type { Language } from "./types";

type WelcomeCopy = { title: string; body: string; introduction: string; graduation: string };
export const welcomeCopy: Record<Language, WelcomeCopy> = {
  "zh-CN": {
    title: "你好，欢迎来到南极星实验室。",
    body: "星月计划，来自南极星实验室。我们把 ChatGPT 网页与本地 Codex 连接起来，让云端的灵感与受控的本地工作环境相互配合。",
    introduction: "不用一次弄懂所有术语。接下来，我们会陪你选择语言和使用方式，再逐步完成登录、连接与验证。你可以返回上一步，也可以稍后继续；不会要求你点赞、付费或交出密码才能进入。",
    graduation: "你已经学会了。接下来，就请尽情地探索互联网吧。祝你好运，祝你有好心情，我的朋友。",
  },
  "zh-Hant": {
    title: "你好，歡迎來到南極星實驗室。",
    body: "星月計畫，來自南極星實驗室。我們把 ChatGPT 網頁與本機 Codex 連線起來，讓雲端的靈感與受控的本機工作環境相互配合。",
    introduction: "不用一次弄懂所有術語。接下來，我們會陪你選擇語言和使用方式，再逐步完成登入、連線與驗證。你可以返回上一步，也可以稍後繼續；不會要求你按讚、付費或交出密碼才能進入。",
    graduation: "你已經學會了。接下來，就請盡情地探索網路吧。祝你好運，祝你有好心情，我的朋友。",
  },
  en: {
    title: "Hello, welcome to Antarctic Star Lab.",
    body: "Project Star & Moon, by Antarctic Star Lab. We connect ChatGPT on the web with local Codex, bringing cloud collaboration and a controlled local workspace together.",
    introduction: "You don't have to learn every term at once. We'll guide you through language, working mode, sign-in, connections and verification. You can go back or continue later. No star, purchase or password sharing is required to enter.",
    graduation: "You've learned the essentials. Now go explore the internet. Good luck, and may your day be a happy one, my friend.",
  },
  fr: {
    title: "Bonjour, bienvenue à Antarctic Star Lab.",
    body: "Voici le projet Étoile et Lune, du Laboratoire de l’Étoile australe. Nous relions ChatGPT sur le Web à Codex local, pour faire coopérer le cloud et un espace de travail local contrôlé.",
    introduction: "Inutile de comprendre tous les termes tout de suite. Nous vous guiderons pour choisir la langue, le mode, la connexion au compte et les liaisons, puis vérifier le résultat. Vous pourrez revenir en arrière ou reprendre plus tard. Aucune étoile, aucun achat ni partage de mot de passe n'est exigé.",
    graduation: "Vous avez appris l'essentiel. À vous d'explorer Internet ! Bonne chance, et que cette journée vous apporte de la joie.",
  },
  ja: {
    title: "こんにちは、南極星ラボへようこそ。",
    body: "南極星ラボの「星と月プロジェクト」へようこそ。Web 版 ChatGPT とローカルの Codex をつなぎ、クラウドと制御されたローカル作業環境の連携を目指します。",
    introduction: "用語を一度に覚える必要はありません。言語と使い方を選び、ログイン、接続、動作確認を順に進めましょう。前の手順に戻ったり、後で再開したりできます。スター、購入、パスワードの共有は不要です。",
    graduation: "これで基本は身につきました。さあ、インターネットの探検を楽しんでください。幸運と、穏やかで楽しい一日を、友よ。",
  },
  ru: {
    title: "Здравствуйте! Добро пожаловать в Antarctic Star Lab.",
    body: "Это проект «Звезда и Луна» от Лаборатории Южной звезды. Мы соединяем веб-версию ChatGPT с локальным Codex для совместной работы облака и управляемой локальной среды.",
    introduction: "Не нужно сразу разбираться во всех терминах. Мы шаг за шагом поможем выбрать язык и режим, войти в аккаунт, настроить подключения и проверить результат. Можно вернуться назад или продолжить позже. Для входа не нужны звёздочка, покупка или передача пароля.",
    graduation: "Вы освоили самое важное. Теперь отправляйтесь исследовать интернет. Удачи и хорошего настроения, мой друг!",
  },
  de: {
    title: "Hallo, willkommen im Antarctic Star Lab.",
    body: "Das ist das Projekt Stern und Mond vom Labor des südlichen Sterns. Es verbindet ChatGPT im Web mit lokalem Codex, damit Cloud und eine kontrollierte lokale Arbeitsumgebung zusammenarbeiten können.",
    introduction: "Du musst nicht alle Begriffe sofort verstehen. Wir begleiten dich durch Sprache, Arbeitsmodus, Anmeldung, Verbindungen und Prüfung. Du kannst zurückgehen oder später weitermachen. Weder ein Stern noch ein Kauf oder die Weitergabe deines Passworts ist Voraussetzung.",
    graduation: "Du hast die Grundlagen gelernt. Jetzt kannst du das Internet erkunden. Viel Glück und einen schönen Tag, mein Freund!",
  },
};

export function detectLanguage(locale: string): Language {
  const parts = locale.trim().toLowerCase().split(/[-_]/);
  const code = parts[0];
  if (code === "zh") {
    // An explicit script wins over region; otherwise TW/HK/MO use Traditional.
    if (parts.includes("hant")) return "zh-Hant";
    if (parts.includes("hans")) return "zh-CN";
    if (parts.some(part => part === "tw" || part === "hk" || part === "mo")) return "zh-Hant";
    return "zh-CN";
  }
  if (code === "ja" || code === "fr" || code === "ru" || code === "de") return code;
  return "en";
}
