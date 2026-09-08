import type { Language } from "../src/types";

export const previewCopy: Record<Language, {
  notice: string; next: string; enter: string; complete: string; completeBody: string;
  farewell: string; confirm: string; cancel: string;
}> = {
  "zh-CN": {
    notice: "仅预览界面 · 无需登录或填写密钥，不会安装、连接或使用额度。",
    next: "继续预览", enter: "预览工作台", complete: "连接完成后的样子。",
    completeBody: "这里展示正式配置完成后的页面效果。当前没有登录、安装或验收任何连接；你可以返回查看，或继续预览工作台。",
    farewell: "愿星光与你同行，我们下次再会", confirm: "确认卸载", cancel: "取消卸载",
  },
  "zh-Hant": {
    notice: "僅預覽介面 · 無需登入或填寫金鑰，不會安裝、連線或使用額度。",
    next: "繼續預覽", enter: "預覽工作台", complete: "連線完成後的樣子。",
    completeBody: "這裡展示正式設定完成後的頁面效果。目前沒有登入、安裝或驗收任何連線；你可以返回查看，或繼續預覽工作台。",
    farewell: "願星光與你同行，我們下次再會", confirm: "確認解除安裝", cancel: "取消解除安裝",
  },
  en: {
    notice: "UI preview only · No sign-in, keys, installation, connection or account usage.",
    next: "Next preview", enter: "Preview workspace", complete: "A preview of the finish.",
    completeBody: "This is how completed setup will look. No account was signed in, nothing was installed and no connection was verified. Go back or preview the workspace.",
    farewell: "May starlight go with you. Until we meet again.", confirm: "Confirm uninstall", cancel: "Cancel uninstall",
  },
  fr: {
    notice: "Aperçu uniquement · Sans connexion, clé, installation ni consommation de quota.",
    next: "Aperçu suivant", enter: "Voir l’espace de travail", complete: "Un aperçu de l’arrivée.",
    completeBody: "Voici l’écran d’une configuration terminée. Aucun compte n’a été connecté, rien n’a été installé et aucune liaison n’a été vérifiée. Revenez en arrière ou explorez l’espace de travail.",
    farewell: "Que la lumière des étoiles vous accompagne. À notre prochaine rencontre.", confirm: "Confirmer la désinstallation", cancel: "Annuler la désinstallation",
  },
  ja: {
    notice: "画面プレビューのみ · ログイン、キー入力、インストール、接続、利用枠の消費はありません。",
    next: "次をプレビュー", enter: "作業画面を見る", complete: "接続完了後のプレビュー。",
    completeBody: "設定完了時の画面を表示しています。ログイン、インストール、接続の検証は行っていません。前に戻るか、作業画面をご覧ください。",
    farewell: "星の光があなたとともにありますように。またお会いしましょう。", confirm: "アンインストールを確認", cancel: "アンインストールをキャンセル",
  },
  ru: {
    notice: "Только просмотр · Без входа, ключей, установки, подключения и расхода квоты.",
    next: "Следующий экран", enter: "Посмотреть рабочую область", complete: "Так выглядит завершение.",
    completeBody: "Это пример экрана после настройки. Вход, установка и проверка подключения не выполнялись. Вернитесь назад или посмотрите рабочую область.",
    farewell: "Пусть свет звёзд будет с вами. До новой встречи.", confirm: "Подтвердить удаление", cancel: "Отменить удаление",
  },
  de: {
    notice: "Nur Vorschau · Keine Anmeldung, Schlüssel, Installation, Verbindung oder Kontonutzung.",
    next: "Nächste Vorschau", enter: "Arbeitsbereich ansehen", complete: "So sieht der Abschluss aus.",
    completeBody: "Dies ist eine Vorschau der abgeschlossenen Einrichtung. Es wurde nichts angemeldet, installiert oder geprüft. Gehe zurück oder sieh dir den Arbeitsbereich an.",
    farewell: "Möge dich das Sternenlicht begleiten. Bis zu unserem nächsten Wiedersehen.", confirm: "Deinstallation bestätigen", cancel: "Deinstallation abbrechen",
  },
};
