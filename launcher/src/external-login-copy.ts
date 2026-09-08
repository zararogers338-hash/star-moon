import type { Language } from "./types";

const en = {
  start: "Sign in with the default browser", chrome: "Sign in with Chrome",
  body: "A separate browser window is used for this sign-in. Sign in normally, then return here. Authorizing imports only this window's ChatGPT/OpenAI session into Star Moon; it does not import your everyday browsing history, saved passwords or other sites. This is a local session handoff, not an OpenAI OAuth app grant.",
  authorize: "I have signed in — authorize this session", cancel: "Cancel browser sign-in",
  embedded: "Use embedded sign-in instead", waiting: "Complete sign-in in the separate browser, then authorize below.",
  importing: "Verifying the authorized session…",
};
export const externalLoginCopy: Record<Language, typeof en> = {
  en,
  "zh-CN": { start: "在默认浏览器中登录", chrome: "在 Chrome 中登录", body: "本次登录使用独立的浏览器窗口。正常登录后回到这里授权，只把该窗口中的 ChatGPT/OpenAI 会话交给星月，不导入日常浏览历史、保存的密码或其他网站资料。这是本地会话交接，不是 OpenAI 的第三方 OAuth 授权。", authorize: "我已登录，授权星月使用此次登录", cancel: "取消浏览器登录", embedded: "改用内嵌登录", waiting: "请在独立浏览器窗口登录，完成后点击下方授权。", importing: "正在验证已授权的会话…" },
  "zh-Hant": { start: "在預設瀏覽器中登入", chrome: "在 Chrome 中登入", body: "本次登入使用獨立瀏覽器視窗。登入後回到此處授權，只將該視窗的 ChatGPT/OpenAI 工作階段交給星月，不匯入日常瀏覽紀錄、密碼或其他網站資料。這是本機工作階段交接，並非 OpenAI 的第三方 OAuth 授權。", authorize: "我已登入，授權使用此次登入", cancel: "取消瀏覽器登入", embedded: "改用內嵌登入", waiting: "請在獨立瀏覽器視窗登入，完成後點選下方授權。", importing: "正在驗證已授權的工作階段…" },
  ja: { start: "既定のブラウザーでサインイン", chrome: "Chrome でサインイン", body: "専用ウィンドウでサインインしてから戻ってください。許可すると、このウィンドウの ChatGPT/OpenAI セッションだけを星月へ引き継ぎます。普段の履歴、保存パスワード、他のサイトは対象外です。これはローカルのセッション引き継ぎで、OpenAI の OAuth アプリ認可ではありません。", authorize: "サインイン済み — 引き継ぎを許可", cancel: "サインインを中止", embedded: "内蔵ブラウザーを使用", waiting: "専用ウィンドウでサインイン後、下で許可してください。", importing: "許可されたセッションを検証中…" },
  fr: { start: "Connexion avec le navigateur par défaut", chrome: "Connexion avec Chrome", body: "Connectez-vous dans la fenêtre dédiée, puis revenez ici. Seule sa session ChatGPT/OpenAI est transférée localement à Star Moon après autorisation, sans historique habituel, mots de passe enregistrés ni autres sites. Ce n’est pas une autorisation OAuth d’application OpenAI.", authorize: "Connexion terminée — autoriser le transfert", cancel: "Annuler la connexion", embedded: "Utiliser le navigateur intégré", waiting: "Connectez-vous dans la fenêtre dédiée, puis autorisez ci-dessous.", importing: "Vérification de la session autorisée…" },
  de: { start: "Im Standardbrowser anmelden", chrome: "In Chrome anmelden", body: "Melden Sie sich im separaten Fenster an und kehren Sie zurück. Nur dessen ChatGPT/OpenAI-Sitzung wird nach Ihrer Zustimmung lokal an Star Moon übergeben, nicht Ihr normaler Verlauf, gespeicherte Passwörter oder andere Websites. Dies ist keine OpenAI-OAuth-App-Freigabe.", authorize: "Angemeldet — Sitzung freigeben", cancel: "Anmeldung abbrechen", embedded: "Eingebettete Anmeldung verwenden", waiting: "Im separaten Fenster anmelden, dann unten freigeben.", importing: "Freigegebene Sitzung wird geprüft…" },
  ru: { start: "Войти в браузере по умолчанию", chrome: "Войти в Chrome", body: "Войдите в отдельном окне и вернитесь сюда. После разрешения Star Moon получит только сеанс ChatGPT/OpenAI из этого окна, без обычной истории, сохранённых паролей и других сайтов. Это локальная передача сеанса, а не OAuth-разрешение приложения OpenAI.", authorize: "Я вошёл — разрешить передачу сеанса", cancel: "Отменить вход", embedded: "Использовать встроенный вход", waiting: "Войдите в отдельном окне, затем разрешите передачу ниже.", importing: "Проверка разрешённого сеанса…" },
};

export const externalBrowserCloseHint: Record<Language, string> = {
  en: "After signing in, close only this dedicated browser window, then return to authorize. This is required for Snap Chromium so no process permissions need to be weakened.",
  "zh-CN": "登录完成后，先关闭本次新开的专用浏览器窗口，再回星月点击授权。Snap Chromium 需要这一步；不会修改系统权限，也不要关闭你日常使用的其他窗口。",
  "zh-Hant": "登入完成後，先關閉本次專用瀏覽器視窗，再回星月授權。Snap Chromium 需要此步驟；不會修改系統權限，也不必關閉日常使用的其他視窗。",
  ja: "サインイン後、この専用ウィンドウだけを閉じてから許可してください。Snap Chromium ではこの手順が必要です。システム権限や普段のウィンドウは変更しません。",
  fr: "Après connexion, fermez seulement cette fenêtre dédiée, puis autorisez le transfert. Snap Chromium exige cette étape, sans modifier les permissions système ni vos fenêtres habituelles.",
  de: "Nach der Anmeldung nur dieses separate Fenster schließen, dann freigeben. Snap Chromium benötigt diesen Schritt, ohne Systemrechte oder Ihre normalen Fenster zu ändern.",
  ru: "После входа закройте только отдельное окно, затем разрешите передачу. Для Snap Chromium это необходимо; системные разрешения и обычные окна не изменяются.",
};
