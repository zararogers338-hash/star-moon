import { useEffect, useLayoutEffect, useState } from "react";
import type { CodexCopyLoginState, Language, LauncherApi } from "./types";

const recheckLogin: Record<Language, string> = { "zh-CN": "重新核验已保存的登录", "zh-Hant": "重新核驗已儲存的登入", en: "Verify saved sign-in", fr: "Vérifier la connexion enregistrée", ja: "保存済みログインを再確認", ru: "Проверить сохранённый вход", de: "Gespeicherte Anmeldung prüfen" };

export const copyLoginWords: Record<Language, { open: string; title: string; waiting: string; preparing: string; verifying: string; complete: string; failed: string; close: string; privacy: string }> = {
  "zh-CN": { open: "在星月内登录", title: "独立 Codex 官方登录", waiting: "请在下方官方页面亲自完成登录", preparing: "正在准备独立登录…", verifying: "正在核对 Codex 登录回执…", complete: "Codex 已确认登录，独立凭据文件权限已检查。", failed: "登录未完成。可关闭后重试，不会伪报成功。", close: "关闭并返回", privacy: "这是官方登录页面，不是星月自制的密码表单。密码和验证码只填在下方页面；星月不读取它们。请确认顶部域名。第三方登录若不支持内嵌浏览器，将明确报错，不会绕过限制。" },
  "zh-Hant": { open: "在星月內登入", title: "獨立 Codex 官方登入", waiting: "請在下方官方頁面親自登入", preparing: "準備獨立登入…", verifying: "核對 Codex 登入回執…", complete: "Codex 已確認登入，獨立憑據檔權限已檢查。", failed: "登入未完成，可關閉後重試。", close: "關閉並返回", privacy: "下方為官方登入頁，非星月密碼表單。密碼與驗證碼只填於官方頁面，星月不讀取。請核對域名；第三方若不支援內嵌瀏覽器，不會繞過限制。" },
  en: { open: "Sign in inside Star Moon", title: "Independent Codex — official sign-in", waiting: "Complete sign-in on the official page below", preparing: "Preparing independent sign-in…", verifying: "Checking the Codex login receipt…", complete: "Codex confirmed sign-in; isolated credential-file permissions checked.", failed: "Sign-in did not complete. Close and retry; success is not assumed.", close: "Close and return", privacy: "This is the official sign-in page, not a Star Moon password form. Enter passwords and codes only there. Star Moon does not read them. Check the displayed origin. Embedded-browser restrictions are reported, never bypassed." },
  fr: { open: "Se connecter dans Star Moon", title: "Codex indépendant — connexion officielle", waiting: "Connectez-vous sur la page officielle ci-dessous", preparing: "Préparation…", verifying: "Vérification du reçu Codex…", complete: "Connexion confirmée par Codex ; permissions du fichier vérifiées.", failed: "Connexion incomplète. Fermez puis réessayez.", close: "Fermer et revenir", privacy: "Page officielle, pas un formulaire Star Moon. Saisissez les secrets uniquement ici ; Star Moon ne les lit pas. Vérifiez l’origine. Aucune restriction du navigateur intégré n’est contournée." },
  ja: { open: "星月内でログイン", title: "独立 Codex・公式ログイン", waiting: "下の公式ページで本人がログインしてください", preparing: "ログインを準備中…", verifying: "Codex の完了通知を確認中…", complete: "Codex がログインを確認し、独立認証ファイルの権限も確認しました。", failed: "ログイン未完了。閉じて再試行できます。", close: "閉じて戻る", privacy: "下は公式ログインページです。星月独自のパスワード入力欄ではありません。秘密情報は公式ページだけに入力してください。表示元を確認してください。埋め込みブラウザー制限は回避しません。" },
  ru: { open: "Войти внутри Star Moon", title: "Независимый Codex — официальный вход", waiting: "Войдите на официальной странице ниже", preparing: "Подготовка входа…", verifying: "Проверка подтверждения Codex…", complete: "Вход подтверждён Codex; права файла учётных данных проверены.", failed: "Вход не завершён. Закройте и повторите.", close: "Закрыть и вернуться", privacy: "Официальная страница, а не форма пароля Star Moon. Вводите секреты только на ней. Star Moon их не читает. Проверьте адрес; ограничения встроенного браузера не обходятся." },
  de: { open: "In Star Moon anmelden", title: "Unabhängiges Codex — offizielle Anmeldung", waiting: "Auf der offiziellen Seite unten selbst anmelden", preparing: "Anmeldung vorbereiten…", verifying: "Codex-Bestätigung prüfen…", complete: "Codex hat die Anmeldung bestätigt; Dateiberechtigungen geprüft.", failed: "Anmeldung unvollständig. Schließen und erneut versuchen.", close: "Schließen und zurück", privacy: "Offizielle Anmeldeseite, kein Star-Moon-Passwortformular. Geheimnisse nur dort eingeben. Star Moon liest sie nicht. Herkunft prüfen; Einschränkungen eingebetteter Browser werden nicht umgangen." },
};

export function CodexCopyLoginPane({ api, language, preview = false }: { api: LauncherApi; language: Language; preview?: boolean }) {
  const [state, setState] = useState<CodexCopyLoginState | null>(null), [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const copy = copyLoginWords[language];
  useEffect(() => {
    if (preview) return;
    let active = true, revision = 0;
    const unsubscribe = api.onCodexCopyLoginChanged(next => { revision++; if (active) setState(next); });
    const readRevision = revision;
    void api.codexCopyLoginStatus().then(next => { if (active && revision === readRevision) setState(next); }).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, [api, preview]);
  useLayoutEffect(() => {
    if (!slot || preview) return;
    const measure = () => { const { x, y, width, height } = slot.getBoundingClientRect(); void api.setCodexCopyLoginBounds({ x, y, width, height }).catch(() => {}); };
    const observer = new ResizeObserver(measure); observer.observe(slot); window.addEventListener("resize", measure); measure();
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [api, slot, preview, state?.state]);
  if (!state || state.state === "idle") return null;
  const message = state.state === "complete" ? copy.complete : state.state === "failed" || state.state === "cancelled" ? copy.failed : state.state === "verifying" ? copy.verifying : state.state === "preparing" ? copy.preparing : copy.waiting;
  return <section className="codex-copy-login-pane" role="dialog" aria-modal="true" aria-label={copy.title}>
    <header><div><strong>{copy.title} · {state.name} · {state.copyId?.slice(0, 8)}</strong><p role="status">{message}</p><code>{state.origin}</code></div>
      <button type="button" onClick={() => void api.cancelCodexCopyLogin().then(setState).catch(() => setState(previous => previous ? { ...previous, state: "failed", error: "SM_COPY_LOGIN_STOP_UNCONFIRMED" } : previous))}>{copy.close}</button></header>
    <p className="codex-copy-login-privacy">{copy.privacy}</p>
    {state.error ? <p role="alert"><code>{state.error}</code></p> : null}
    {state.state === "failed" && state.copyId ? <button type="button" className="button-secondary" onClick={() => void api.verifyCodexCopyLogin(state.copyId!).then(setState).catch(() => {})}>{recheckLogin[language]}</button> : null}
    {state.state === "waiting-user" || state.state === "preparing" ? <div className="codex-copy-login-slot" ref={setSlot} /> : null}
  </section>;
}
