import { useState } from "react";
import type { Language, LauncherApi, LauncherState } from "./types";

const en = { pause: "Pause configuration", title: "Configuration paused", body: "Saved progress is preserved. Unsubmitted keys are not saved in the pause record. The connection is not marked complete. You can continue later or quit Star Moon now.", resume: "Continue configuration", quit: "Quit Star Moon" };
export const pausedSetupCopy: Record<Language, typeof en> = {
  en,
  "zh-CN": { pause: "暂停配置", title: "配置已暂停", body: "已保存的进度会保留，尚未提交的密钥不会写入暂停记录。连接仍未标记完成。你可以稍后继续，也可以现在退出星月。", resume: "继续配置", quit: "退出星月" },
  "zh-Hant": { pause: "暫停設定", title: "設定已暫停", body: "已儲存的進度會保留，尚未提交的金鑰不會寫入暫停紀錄。連線仍未標記完成。可稍後繼續或現在結束星月。", resume: "繼續設定", quit: "結束星月" },
  ja: { pause: "設定を一時停止", title: "設定は一時停止中です", body: "保存済みの進捗は保持されます。未送信のキーは保存されず、接続は完了扱いになりません。後で再開するか、星月を終了できます。", resume: "設定を再開", quit: "星月を終了" },
  fr: { pause: "Suspendre la configuration", title: "Configuration suspendue", body: "La progression enregistrée est conservée, sans sauvegarder les clés non envoyées ni valider la connexion. Vous pouvez reprendre plus tard ou quitter Star Moon.", resume: "Reprendre la configuration", quit: "Quitter Star Moon" },
  de: { pause: "Einrichtung pausieren", title: "Einrichtung pausiert", body: "Gespeicherter Fortschritt bleibt erhalten. Nicht übermittelte Schlüssel werden nicht gespeichert und die Verbindung gilt nicht als abgeschlossen. Sie können später fortfahren oder Star Moon beenden.", resume: "Einrichtung fortsetzen", quit: "Star Moon beenden" },
  ru: { pause: "Приостановить настройку", title: "Настройка приостановлена", body: "Сохранённый прогресс остаётся. Неотправленные ключи не сохраняются, подключение не отмечается завершённым. Можно продолжить позже или выйти из Star Moon.", resume: "Продолжить настройку", quit: "Выйти из Star Moon" },
};

export function PausedSetup({ api, language, updateState }: { api: LauncherApi; language: Language; updateState: (state: LauncherState) => void }) {
  const copy = pausedSetupCopy[language];
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  return <main className="welcome setup-paused" lang={language}>
    <section><h1>{copy.title}</h1><p>{copy.body}</p>
      {error ? <p role="alert">{error}</p> : null}
      <div className="journey-links">
        <button type="button" className="button-primary" disabled={busy} onClick={() => void run(async () => updateState(await api.resumeGuidedSetup()))}>{copy.resume}</button>
        <button type="button" className="button-secondary" disabled={busy} onClick={() => void run(async () => { const result = await api.quitLauncher(); if (!result.ok) throw new Error(result.message); })}>{copy.quit}</button>
      </div>
    </section>
  </main>;
}
