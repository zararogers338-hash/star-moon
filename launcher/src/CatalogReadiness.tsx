import { useEffect, useRef, useState } from "react";
import type { CatalogStatus, Language, LauncherApi } from "./types";

export const catalogIntro: Record<Language, string> = {
  "zh-CN": "如果你已经在独立副本中实际使用成功，可以直接继续配置。自动目录检查可以稍后再做，不必为了进入下一页反复登录或重启。检查结果与用户确认会分开记录。",
  "zh-Hant": "如果你已在獨立副本中實際使用成功，可以直接繼續設定。自動目錄檢查可以稍後進行，不必反覆登入或重啟。檢查結果與使用者確認分開記錄。",
  en: "If your independent copy already works, continue configuring now. Automatic catalog checks can wait; you do not need repeated sign-ins or restarts to reach the next page. User confirmation and verified results stay separate.",
  fr: "Si votre copie fonctionne déjà, continuez la configuration. Le contrôle automatique peut attendre, sans connexions ni redémarrages répétés. Confirmation utilisateur et vérification restent distinctes.",
  ja: "独立コピーが実際に動作しているなら、そのまま設定を続けられます。自動確認は後で行えます。ユーザー確認と自動検証結果は別に記録します。",
  ru: "Если независимая копия уже работает, продолжайте настройку. Автопроверку можно отложить без повторных входов и перезапусков. Подтверждение пользователя и результат проверки хранятся отдельно.",
  de: "Wenn die unabhängige Kopie bereits funktioniert, können Sie fortfahren. Die automatische Prüfung kann warten; wiederholte Anmeldungen oder Neustarts sind nicht nötig. Bestätigung und Prüfergebnis bleiben getrennt.",
};

export const catalogContinue: Record<Language, string> = {
  "zh-CN": "我确认副本已可用，继续配置", "zh-Hant": "我確認副本可用，繼續設定", en: "My copy works — continue setup",
  fr: "Ma copie fonctionne — continuer", ja: "コピーの動作を確認済み・設定を続ける", ru: "Копия работает — продолжить", de: "Kopie funktioniert — Einrichtung fortsetzen",
};
export const catalogDeferredNotice: Record<Language, string> = {
  "zh-CN": "已按你的选择继续配置；自动目录检查仍待完成，未被标记为通过。", "zh-Hant": "已依你的選擇繼續設定；自動目錄檢查仍待完成，並未標示通過。",
  en: "Continuing by your choice. The automatic catalog check is still pending, not marked passed.",
  fr: "Configuration poursuivie à votre demande. Le contrôle du catalogue reste en attente, pas validé.",
  ja: "あなたの選択で設定を続行しています。自動確認は未完了のままで、成功には変更していません。",
  ru: "Настройка продолжена по вашему выбору. Проверка каталога ожидается, а не отмечена успешной.",
  de: "Auf Ihren Wunsch fortgesetzt. Die automatische Katalogprüfung bleibt ausstehend, nicht bestanden.",
};

type Copy = { title: string; check: string; loading: string; failed: string; waiting: string; blocked: string; observed: string; unavailable: string; auth: string; requestFailed: string; scope: string };
export const catalogCopy: Record<Language, Copy> = {
  "zh-CN": { title: "连接实际到哪一步了？", check: "重新检查客户端配置", loading: "正在读取配置和本地健康状态…", failed: "检查未完成，可以返回或重试。", waiting: "本地服务已就绪，正在等待 Codex 携带授权请求模型目录。", blocked: "现有模型来源、静态目录或配置档案与此接入不兼容。仅重启不会解决；请先决定保留现有入口、另建独立配置，还是切换默认来源。此处不会自动覆盖。", observed: "已收到模型目录，磁盘配置也相容；尚不代表模型与工具往返已通过。", unavailable: "本地运行时暂不可用或所有权不匹配，请查看诊断后重试。", auth: "目录请求缺少或未通过 Codex 授权。网页登录和 Codex 登录是两套状态，请勿把密码或令牌粘贴到日志。", requestFailed: "目录请求未成功，请查看诊断中的 HTTP 状态。", scope: "只读检查用户级磁盘配置和本地服务；不读取密钥、不调用模型、不修改配置。活动任务、命令行或其他配置层的覆盖仍需单独核验。" },
  "zh-Hant": { title: "連線實際進行到哪裡？", check: "重新檢查客戶端設定", loading: "正在讀取設定與本機狀態…", failed: "檢查未完成，可返回或重試。", waiting: "本機服務已就緒，等待 Codex 帶授權請求模型目錄。", blocked: "現有模型來源、靜態目錄或設定檔與此接入不相容。重新啟動無法解決；請先選擇保留現有入口另建獨立設定，或切換預設來源。這裡不會自動覆寫。", observed: "已收到目錄且磁碟設定相容；不代表模型與工具往返已通過。", unavailable: "本機執行環境不可用或所有權不符，請查看診斷。", auth: "目錄請求缺少或未通過 Codex 授權。網頁與 Codex 登入分開，請勿將密碼或權杖貼到日誌。", requestFailed: "目錄請求失敗，請查看 HTTP 狀態。", scope: "唯讀檢查使用者磁碟設定與本機服務；不讀取密鑰、不呼叫模型、不修改設定。活動工作及其他設定層需另行驗證。" },
  en: { title: "Actual connection readiness", check: "Recheck client configuration", loading: "Reading configuration and local health…", failed: "The check did not finish. You can go back or retry.", waiting: "The local service is ready; waiting for an authenticated Codex catalog request.", blocked: "The selected provider, static catalog or profile conflicts with this route. Restarting alone will not help. Choose a separate configuration or explicitly switch the default provider; nothing is overwritten here.", observed: "Catalog observed and disk settings compatible; model and tool round trips remain separate checks.", unavailable: "Local runtime unavailable or ownership mismatch. Check diagnostics before retrying.", auth: "The catalog request needs Codex authentication. Web login and Codex login are separate. Never paste credentials into diagnostics.", requestFailed: "Catalog request failed. Inspect the HTTP status in diagnostics.", scope: "Read-only user-config and local-service inspection: no credentials, model calls or config changes. Active tasks and CLI/other configuration layers need separate verification." },
  fr: { title: "État réel de la connexion", check: "Revérifier le client", loading: "Lecture de la configuration et du service…", failed: "Vérification incomplète. Retour ou nouvel essai possible.", waiting: "Service prêt ; en attente d’une requête de catalogue Codex authentifiée.", blocked: "Le fournisseur, catalogue statique ou profil sélectionné est incompatible. Redémarrer ne suffit pas. Choisissez une configuration séparée ou un changement explicite du fournisseur ; aucun écrasement automatique.", observed: "Catalogue reçu et configuration compatible ; les échanges modèle/outils restent à vérifier.", unavailable: "Service indisponible ou propriétaire incorrect. Consultez le diagnostic.", auth: "Une authentification Codex est nécessaire. La connexion Web est distincte. Ne collez aucun identifiant dans les diagnostics.", requestFailed: "Échec du catalogue. Consultez le statut HTTP.", scope: "Lecture seule de la configuration utilisateur et du service local : aucun secret, appel de modèle ou changement. Les autres couches et tâches actives restent à vérifier." },
  ja: { title: "実際の接続状況", check: "クライアント設定を再確認", loading: "設定とローカル状態を確認中…", failed: "確認が完了しませんでした。戻るか再試行できます。", waiting: "ローカルサービスは準備完了。認証付き Codex カタログ要求を待っています。", blocked: "選択中のプロバイダー、静的カタログまたはプロファイルが競合しています。再起動だけでは直りません。独立設定か明示的な切り替えが必要です。自動上書きはしません。", observed: "カタログとディスク設定を確認しました。モデルとツールの往復は別途検証が必要です。", unavailable: "実行環境が利用できないか所有者が一致しません。診断をご確認ください。", auth: "Codex 認証が必要です。Web ログインとは別です。診断に認証情報を貼らないでください。", requestFailed: "カタログ要求失敗。HTTP 状態をご確認ください。", scope: "ユーザー設定とローカルサービスを読み取り専用で確認します。秘密情報、モデル呼び出し、設定変更はありません。他の設定層や実行中タスクは別途確認が必要です。" },
  ru: { title: "Фактическая готовность", check: "Проверить настройки клиента", loading: "Чтение настроек и состояния…", failed: "Проверка не завершена. Можно вернуться или повторить.", waiting: "Сервис готов; ожидается авторизованный запрос каталога Codex.", blocked: "Выбранный провайдер, статический каталог или профиль несовместим. Перезапуск не поможет. Нужна отдельная конфигурация или явное переключение; автоматической перезаписи нет.", observed: "Каталог получен, настройки совместимы; модель и инструменты ещё требуют проверки.", unavailable: "Сервис недоступен или владелец не совпадает. Проверьте диагностику.", auth: "Нужна авторизация Codex, отдельная от входа в браузере. Не вставляйте учётные данные в диагностику.", requestFailed: "Запрос каталога не удался. Проверьте HTTP-статус.", scope: "Только чтение пользовательских настроек и локального сервиса. Без секретов, вызова моделей или изменений. Другие уровни и активные задачи проверяются отдельно." },
  de: { title: "Tatsächlicher Verbindungsstatus", check: "Client-Konfiguration prüfen", loading: "Konfiguration und lokalen Dienst prüfen…", failed: "Prüfung unvollständig. Zurück oder erneut versuchen ist möglich.", waiting: "Dienst bereit; wartet auf eine authentifizierte Codex-Kataloganfrage.", blocked: "Provider, statischer Katalog oder Profil passen nicht zur Verbindung. Ein Neustart reicht nicht. Separate Konfiguration oder ausdrücklicher Wechsel erforderlich; kein automatisches Überschreiben.", observed: "Katalog empfangen, Konfiguration kompatibel; Modell- und Werkzeugabläufe bleiben separat zu prüfen.", unavailable: "Dienst nicht verfügbar oder Eigentümer stimmt nicht. Diagnose prüfen.", auth: "Codex-Authentifizierung erforderlich; sie ist vom Web-Login getrennt. Keine Zugangsdaten in Diagnosen einfügen.", requestFailed: "Kataloganfrage fehlgeschlagen. HTTP-Status prüfen.", scope: "Nur lesende Prüfung von Benutzerkonfiguration und lokalem Dienst. Keine Geheimnisse, Modellaufrufe oder Änderungen. Andere Ebenen und laufende Aufgaben sind separat zu prüfen." },
};
const fields: Record<string, string> = { "custom-provider": "model_provider", "static-catalog": "model_catalog_json", "provider-auth": "requires_openai_auth", "route-mismatch": "openai_base_url", "profile-selected": "profile", "config-unreadable": "config.toml", "integration-invalid": "integration-journal" };

export function CatalogReadiness({ api, language, disabled = false, onContinue }: { api: Pick<LauncherApi, "catalogStatus">; language: Language; disabled?: boolean; onContinue?: () => void }) {
  const copy = catalogCopy[language];
  const [status, setStatus] = useState<CatalogStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const check = async () => {
    if (inFlight.current || disabled) return;
    inFlight.current = true; setChecking(true); setFailed(false);
    try {
      const result = await api.catalogStatus();
      if (mounted.current) setStatus(result);
    } catch { if (mounted.current) setFailed(true); }
    finally { inFlight.current = false; if (mounted.current) setChecking(false); }
  };
  // The native command has an eight-second deadline. No timer launches a model,
  // changes config, or retries a failed operation. Back stays available.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const message = !status ? copy.waiting : status.state === "blocked" ? copy.blocked
    : status.state === "observed" ? copy.observed : status.state === "proxy-unavailable" ? copy.unavailable
    : status.state === "authentication-required" ? copy.auth : status.state === "request-failed" ? copy.requestFailed : copy.waiting;
  return <section className="catalog-readiness" aria-label={copy.title}>
    <h2>{copy.title}</h2>
    <p role="status">{checking ? copy.loading : failed ? copy.failed : status ? message : copy.scope}</p>
    {status ? <><dl><dt>model_provider</dt><dd><code>{status.routing.provider}</code></dd><dt>127.0.0.1</dt><dd><code>{status.port}</code></dd><dt>HTTP</dt><dd>{status.lastStatus ?? "—"}</dd></dl>
      {status.routing.issues.length ? <ul>{status.routing.issues.map(issue => <li key={issue}><code>{fields[issue] ?? "unknown"}</code></li>)}</ul> : null}
      <small>{copy.scope}</small></> : null}
    <button type="button" className="button-secondary" disabled={disabled || checking} onClick={() => void check()}>{checking ? copy.loading : copy.check}</button>
    {onContinue ? <button type="button" className="button-primary" disabled={disabled || checking} onClick={onContinue}>{catalogContinue[language]}</button> : null}
  </section>;
}
