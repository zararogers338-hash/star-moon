// Static interface copy only. Protocol action names and response JSON remain
// unchanged, and no capability or account information belongs in this module.
const MOON_LETTER_LANGUAGES = Object.freeze(["zh-CN", "zh-Hant", "en", "ja", "fr", "ru", "de"]);
const COPY = {
  "zh-CN": {
    pageTitle: "明月初次升起 · 本地接管", brand: "星月计划 · 仅限本机 · 限时授权", heading: "明月初次升起",
    intro: "这封月夜信已经寄出。代理可在这里查看进度，并使用被允许的安装操作。",
    keyLabel: "临时接管密钥", keyPlaceholder: "填入月夜信中的临时接管密钥",
    actions: { inspect: "查看进度", advance: "继续安装一步", "open-login": "打开登录", "authorize-agentdock": "授权 AgentDock", revoke: "停止接管" },
    waiting: "等待代理接手。登录、提权和新增授权需要本人完成。",
    boundary: "不会接收任意命令或脚本。若仍有安装操作运行，停止接管只撤销新请求，不代表操作已经停止。操作失败或结果不确定时，请先核查，再由本人重新创建月夜信。",
    details: "技术结果（原始 JSON）", requesting: "正在请求：", revoking: "正在撤销新请求；已开始的操作仍可能完成。",
    uncertain: "连接已关闭，或结果尚不确定。请查看启动器状态，先核查再重试；不要自动重做。",
    received: "已收到结果，请核对下方详情。", operationRunning: "已有操作正在运行，请等待并查看进度。",
    needsUser: "下一步需要你本人操作，请查看启动器提示。", needsReview: "结果需要核查；新安装操作已暂停。请先查看详情，再决定是否重新创建月夜信。",
    revoked: "接管授权已撤销，不再接受新请求。", unauthorized: "密钥不正确，或授权已撤销、过期。请在启动器核对状态。", rejected: "请求未被接受，请查看下方技术结果。",
  },
  "zh-Hant": {
    pageTitle: "明月初次升起 · 本機接管", brand: "星月計畫 · 僅限本機 · 限時授權", heading: "明月初次升起",
    intro: "這封月夜信已經寄出。代理可在這裡查看進度，並使用允許的安裝操作。",
    keyLabel: "臨時接管金鑰", keyPlaceholder: "填入月夜信中的臨時接管金鑰",
    actions: { inspect: "查看進度", advance: "繼續安裝一步", "open-login": "開啟登入", "authorize-agentdock": "授權 AgentDock", revoke: "停止接管" },
    waiting: "等待代理接手。登入、提升權限和新增授權仍須由你本人完成。",
    boundary: "不接受任意指令或腳本。若仍有安裝操作執行中，停止接管只會撤銷新請求，不代表操作已經停止。操作失敗或結果不確定時，請先核查，再由本人重新建立月夜信。",
    details: "技術結果（原始 JSON）", requesting: "正在請求：", revoking: "正在撤銷新請求；已開始的操作仍可能完成。",
    uncertain: "連線已關閉，或結果尚不確定。請查看啟動器狀態，先核查再重試；不要自動重做。",
    received: "已收到結果，請核對下方詳細資訊。", operationRunning: "已有操作正在執行，請等待並查看進度。",
    needsUser: "下一步需要你本人操作，請查看啟動器提示。", needsReview: "結果需要核查；新的安裝操作已暫停。請先查看詳細資訊，再決定是否重新建立月夜信。",
    revoked: "接管授權已撤銷，不再接受新請求。", unauthorized: "金鑰不正確，或授權已撤銷、過期。請在啟動器核對狀態。", rejected: "請求未被接受，請查看下方技術結果。",
  },
  en: {
    pageTitle: "The first moonrise · Local assistance", brand: "Project Star & Moon · This computer only · Time-limited access", heading: "The first moonrise",
    intro: "Your Moon Letter is ready. Your chosen agent can inspect progress here and use the permitted setup actions.",
    keyLabel: "Temporary access key", keyPlaceholder: "Enter the temporary access key from your Moon Letter",
    actions: { inspect: "Inspect progress", advance: "Advance one setup step", "open-login": "Open sign-in", "authorize-agentdock": "Authorize AgentDock", revoke: "Stop assistance" },
    waiting: "Waiting for your agent. You must complete sign-in, elevation and new permissions yourself.",
    boundary: "Arbitrary commands and scripts are not accepted. Stopping assistance blocks new requests; an already-running operation may still finish. If an action fails or its result is uncertain, review it before you create another Moon Letter.",
    details: "Technical result (original JSON)", requesting: "Requesting:", revoking: "Revoking new requests; an already-running operation may still finish.",
    uncertain: "The connection closed, or the result is uncertain. Check the launcher before retrying; do not automatically repeat the action.",
    received: "Result received. Review the details below.", operationRunning: "An operation is still running. Please wait and inspect progress.",
    needsUser: "The next step needs your action. Check the launcher for instructions.", needsReview: "This result needs review. New setup actions are paused; inspect the details before deciding whether to create another Moon Letter.",
    revoked: "Assistance access is revoked. New requests are blocked.", unauthorized: "The key is incorrect, or access was revoked or expired. Check the launcher status.", rejected: "The request was not accepted. Review the technical result below.",
  },
  ja: {
    pageTitle: "はじめての月の出 · ローカル支援", brand: "星と月プロジェクト · この端末のみ · 有効期限付き", heading: "はじめての月の出",
    intro: "月夜の手紙を用意しました。選んだエージェントはここで進行状況を確認し、許可された設定操作を行えます。",
    keyLabel: "一時アクセスキー", keyPlaceholder: "月夜の手紙に記載された一時アクセスキーを入力",
    actions: { inspect: "進行状況を確認", advance: "設定を一段階進める", "open-login": "ログインを開く", "authorize-agentdock": "AgentDock を許可", revoke: "支援を停止" },
    waiting: "エージェントを待っています。ログイン、権限の昇格、新しい許可は本人が行ってください。",
    boundary: "任意のコマンドやスクリプトは受け付けません。停止すると新しいリクエストを拒否しますが、実行中の操作は完了する場合があります。失敗や結果の不確定があれば、内容を確認してから本人が手紙を作り直してください。",
    details: "技術的な結果（元の JSON）", requesting: "リクエスト中：", revoking: "新しいリクエストを停止しています。実行中の操作は完了する場合があります。",
    uncertain: "接続が閉じたか、結果が未確定です。再試行前にランチャーを確認し、自動で操作を繰り返さないでください。",
    received: "結果を受信しました。下の詳細を確認してください。", operationRunning: "操作が実行中です。しばらく待ち、進行状況を確認してください。",
    needsUser: "次の手順は本人の操作が必要です。ランチャーの案内を確認してください。", needsReview: "結果の確認が必要です。新しい設定操作は停止中です。詳細を確認してから手紙を作り直すか判断してください。",
    revoked: "支援の許可を取り消しました。新しいリクエストは受け付けません。", unauthorized: "キーが違うか、許可が取り消されたか期限切れです。ランチャーで確認してください。", rejected: "リクエストは受理されませんでした。下の技術的な結果を確認してください。",
  },
  fr: {
    pageTitle: "Le premier lever de lune · Assistance locale", brand: "Projet Étoile et Lune · Cet ordinateur uniquement · Accès temporaire", heading: "Le premier lever de lune",
    intro: "Votre lettre au clair de lune est prête. L’agent choisi peut consulter la progression et effectuer les opérations de configuration autorisées.",
    keyLabel: "Clé d’accès temporaire", keyPlaceholder: "Saisissez la clé temporaire de votre lettre",
    actions: { inspect: "Voir la progression", advance: "Avancer d’une étape", "open-login": "Ouvrir la connexion", "authorize-agentdock": "Autoriser AgentDock", revoke: "Arrêter l’assistance" },
    waiting: "En attente de l’agent. Connexion, élévation et nouvelles permissions restent à votre charge.",
    boundary: "Les commandes et scripts arbitraires sont refusés. L’arrêt bloque les nouvelles requêtes ; une opération en cours peut encore se terminer. En cas d’échec ou de résultat incertain, vérifiez les détails avant de créer une nouvelle lettre.",
    details: "Résultat technique (JSON original)", requesting: "Requête en cours :", revoking: "Révocation des nouvelles requêtes ; une opération en cours peut encore se terminer.",
    uncertain: "La connexion est fermée ou le résultat est incertain. Vérifiez le lanceur avant de réessayer ; ne répétez pas automatiquement l’opération.",
    received: "Résultat reçu. Vérifiez les détails ci-dessous.", operationRunning: "Une opération est en cours. Patientez et consultez la progression.",
    needsUser: "La prochaine étape nécessite votre intervention. Consultez le lanceur.", needsReview: "Ce résultat doit être vérifié. Les nouvelles opérations sont suspendues ; consultez les détails avant de décider de créer une autre lettre.",
    revoked: "L’accès est révoqué. Les nouvelles requêtes sont bloquées.", unauthorized: "Clé incorrecte, accès révoqué ou expiré. Vérifiez l’état dans le lanceur.", rejected: "La requête n’a pas été acceptée. Consultez le résultat technique ci-dessous.",
  },
  ru: {
    pageTitle: "Первый восход луны · Локальная помощь", brand: "Проект «Звезда и Луна» · Только этот компьютер · Временный доступ", heading: "Первый восход луны",
    intro: "Лунное письмо готово. Выбранный агент может проверить ход настройки и выполнить разрешённые действия.",
    keyLabel: "Временный ключ доступа", keyPlaceholder: "Введите временный ключ из Лунного письма",
    actions: { inspect: "Проверить ход настройки", advance: "Выполнить следующий шаг", "open-login": "Открыть вход", "authorize-agentdock": "Разрешить AgentDock", revoke: "Остановить помощь" },
    waiting: "Ожидаем агента. Вход, повышение привилегий и выдачу новых разрешений выполняете вы сами.",
    boundary: "Произвольные команды и скрипты не принимаются. Остановка блокирует новые запросы, но уже запущенная операция может завершиться. При ошибке или неопределённом результате сначала проверьте детали, затем решайте, создавать ли новое письмо.",
    details: "Технический результат (исходный JSON)", requesting: "Выполняется запрос:", revoking: "Новые запросы отзываются; уже запущенная операция может завершиться.",
    uncertain: "Соединение закрыто или результат неопределён. Проверьте приложение перед повтором; не повторяйте действие автоматически.",
    received: "Результат получен. Проверьте детали ниже.", operationRunning: "Операция ещё выполняется. Подождите и проверьте ход настройки.",
    needsUser: "Следующий шаг требует вашего действия. Посмотрите подсказку в приложении.", needsReview: "Результат требует проверки. Новые действия приостановлены; изучите детали, прежде чем создавать новое письмо.",
    revoked: "Доступ отозван. Новые запросы заблокированы.", unauthorized: "Ключ неверен, доступ отозван или срок истёк. Проверьте состояние в приложении.", rejected: "Запрос не принят. Посмотрите технический результат ниже.",
  },
  de: {
    pageTitle: "Der erste Mondaufgang · Lokale Hilfe", brand: "Projekt Stern und Mond · Nur dieser Computer · Zeitlich begrenzter Zugriff", heading: "Der erste Mondaufgang",
    intro: "Dein Mondbrief ist bereit. Der gewählte Agent kann den Fortschritt prüfen und die erlaubten Einrichtungsschritte ausführen.",
    keyLabel: "Temporärer Zugriffsschlüssel", keyPlaceholder: "Gib den temporären Schlüssel aus deinem Mondbrief ein",
    actions: { inspect: "Fortschritt prüfen", advance: "Einen Schritt fortfahren", "open-login": "Anmeldung öffnen", "authorize-agentdock": "AgentDock autorisieren", revoke: "Hilfe beenden" },
    waiting: "Wir warten auf den Agenten. Anmeldung, Rechteerhöhung und neue Berechtigungen bestätigst du selbst.",
    boundary: "Beliebige Befehle oder Skripte werden nicht angenommen. Das Beenden sperrt neue Anfragen; ein laufender Vorgang kann noch fertig werden. Prüfe Fehler oder unklare Ergebnisse, bevor du einen neuen Mondbrief erstellst.",
    details: "Technisches Ergebnis (ursprüngliches JSON)", requesting: "Anfrage läuft:", revoking: "Neue Anfragen werden gesperrt; ein laufender Vorgang kann noch fertig werden.",
    uncertain: "Die Verbindung wurde geschlossen oder das Ergebnis ist unklar. Prüfe den Launcher vor einem neuen Versuch; wiederhole den Vorgang nicht automatisch.",
    received: "Ergebnis erhalten. Prüfe die Einzelheiten unten.", operationRunning: "Ein Vorgang läuft noch. Bitte warte und prüfe den Fortschritt.",
    needsUser: "Der nächste Schritt benötigt deine Aktion. Sieh im Launcher nach.", needsReview: "Dieses Ergebnis muss geprüft werden. Neue Schritte sind gesperrt; prüfe die Einzelheiten, bevor du einen weiteren Mondbrief erstellst.",
    revoked: "Der Zugriff wurde widerrufen. Neue Anfragen sind gesperrt.", unauthorized: "Der Schlüssel ist falsch oder der Zugriff wurde widerrufen oder ist abgelaufen. Prüfe den Launcher.", rejected: "Die Anfrage wurde nicht angenommen. Prüfe das technische Ergebnis unten.",
  },
};
for (const copy of Object.values(COPY)) { Object.freeze(copy.actions); Object.freeze(copy); }
Object.freeze(COPY);

function moonLetterPageCopy(language = "zh-CN") {
  const selected = typeof language === "string" && Object.hasOwn(COPY, language) ? language : "en";
  return { language: selected, copy: COPY[selected] };
}
module.exports = { MOON_LETTER_LANGUAGES, moonLetterPageCopy };
