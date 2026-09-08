# Cockpit Tools、号池和 Claude 接入边界

这份文档记录 Star Moon 5.0.2 与 `jlcodes99/cockpit-tools` 的融合方案。它是架构和验收边界，不把未执行的联网、登录、账户切换或网页模型请求写成已完成能力。

## 产品叙事命名

Cockpit Tools 原本的产品叙事不是一条线性剧情，而是一座总控台：仪表盘先收拢多个平台的状态，账号页管理成员，实例页把账号放进并行工作空间，API Service 再把这些能力投影为可以调用的模型入口。Star Moon 的融合层沿用这个结构，并使用两层名称：

- **群星**：账号和浏览器池。每一个 GPT Web 或 Claude Web 登录身份都是一颗星，拥有独立 profile、cookie jar、组织/计划、能力快照、额度和健康状态。账号池可以组成星座、分组和工作区；调度器只租用一个明确的星，不把多个账号的会话混成一个浏览器。
- **虚假之天**：所有可被编排的原始能力总层。它包含 ChatGPT Web、Claude Web、Cockpit API sidecar、Anthropic/OpenAI-compatible provider、MCP 工具、图片、搜索、实例和路由策略。它是能力地图，不是“一个万能模型”，每个能力都必须带 provider、transport、auth boundary 和 evidence 状态。

这个命名描述的是产品边界，不会改变第三方账号的权限、额度或服务条款。号池用于隔离、可观测、会话亲和和故障切换，不应宣传成绕过任何供应商额度或限制的工具。

## 已确认的 Cockpit 能力

本次审计读取的 Cockpit Tools 提交是 `0e5cde0225750316937fd084d7a2a16a408490ba`（v1.3.45）。它已经包含：

- Codex 多账号和账号组管理；
- API Service 侧车 `cockpit-cliproxy`；
- OpenAI 兼容的 `/v1/models`、`/v1/chat/completions`、`/v1/responses`、`/v1/responses/compact`；
- Anthropic Messages 的 `/v1/messages` 和计数接口；
- Gemini、图片和 Responses WebSocket 兼容路径；
- 自动、随机、单账号、按额度、套餐、过期时间和自定义优先级/权重路由；
- 默认会话亲和、账号冷却、额度保留和请求/用量日志；
- Claude Desktop 登录/账号管理，以及用于读取 Claude Web 账户资料和额度的独立辅助器。

这些能力足够支持“一个 Star Moon 入口，多个 Cockpit 账号池成员”，但不等于 Star Moon 已经连接了 Cockpit，也不等于 Claude Web 的对话流已经可代理。

## 建议的融合方式

Star Moon 保留自己的 Electron 浏览器、ChatGPT Web adapter、Codex 路由 journal 和安全边界。Cockpit 作为可选的外部 provider gateway 运行：

```text
Codex / Star Moon
       │ OpenAI-compatible Responses + SSE/WebSocket
       ▼
Star Moon Cockpit provider adapter
       │ loopback URL + generated API key
       ▼
Cockpit cockpit-cliproxy sidecar
       ├─ Codex OAuth / account pool
       ├─ OpenAI-compatible providers
       └─ Anthropic/Gemini translators
```

Star Moon 只保存 Cockpit 网关的 loopback 地址、受管 key 的指纹和能力快照，不复制 Cockpit 的 OAuth refresh token、Claude cookie 或生成的 `auths/` 文件。账号选择、额度、冷却、会话亲和和重试由 Cockpit 单点负责，避免两个进程同时刷新同一 refresh token 或各自计算“可用账号”。

第一阶段应该实现一个显式的 `cockpit` provider adapter：

1. 只允许用户选择已确认的 `http://127.0.0.1:<port>/v1` 或显式 HTTPS 地址；
2. 通过 `/v1/models` 做真实健康和目录探测；
3. 对 Responses、SSE、WebSocket、图片和 compact 分别记录能力，不因为 `/healthz` 通过就宣传所有能力可用；
4. 原样保留 Cockpit 的模型前缀/别名，拒绝未知模型，禁止静默回退到 ChatGPT Web；
5. 对每个请求保存 `route=external-cockpit`、模型、状态、延迟和账号池摘要，不保存 token、cookie、prompt 或完整响应；
6. Star Moon 的本地 MCP 工具仍由 Star Moon 的 turn broker 管理，Cockpit 的账号池不自动获得本地文件、shell 或审批权限。

这样可以先接入“Cockpit 里反向代理出来的 GPT”，并把号池切换留给 Cockpit。只有真实的 `/v1/models`、无副作用 Responses 请求、流式结束、失败重试和重启后会话保留都通过后，才能把它标成可用路线。

## 群星：多浏览器登录池

如果目标是“很多个网页登录身份”，Cockpit 的 API 账号池不能直接替代浏览器池。两者必须分开：

```text
群星 Registry
  ├─ GPT-01 -> Electron partition/profile GPT-01 -> ChatGPT Web adapter
  ├─ GPT-02 -> Electron partition/profile GPT-02 -> ChatGPT Web adapter
  ├─ CL-01  -> Electron partition/profile CL-01  -> Claude Web adapter (实验)
  └─ CL-02  -> Electron partition/profile CL-02  -> Claude Web adapter (实验)

虚假之天 Scheduler
  ├─ provider + account + conversation lease
  ├─ quota / health / cooldown / affinity
  ├─ browser worker concurrency
  └─ MCP capability policy
```

每颗星必须有自己的：

- Electron `session` partition 和用户数据目录；
- 登录状态、组织/工作区状态和 connector 选择；
- browser worker、turn lease 和 conversation map；
- 额度、限流、失败和最近一次可验证请求记录。

调度顺序建议是：固定会话亲和 → 显式账号/星座选择 → 健康和限流筛选 → 额度/计划策略 → 最后才是轮询或随机。正在执行的对话不能因为另一颗星额度更高而中途换星。池耗尽时返回结构化 `account_pool_unavailable`，不能静默改走另一 provider。

浏览器池初期应限制为每颗星一个活动浏览器 turn，整体并发上限先固定为 5，与当前 Star Moon 浏览器 host 的安全上限一致；通过真实账号矩阵和取消/重启测试后再调整。

## 号池设计

用户说的“登一群号形成号池”分为两个层次：

- **管理层**：Cockpit 已支持批量导入、账号组、标签、API key 账号范围和批量刷新；这部分应复用 Cockpit UI/存储，不在 Star Moon 再做一份账号数据库。
- **调用层**：每个 Star Moon provider 绑定一个 Cockpit API key 或 key scope。Star Moon 只选择 `pool`、`single-account` 或一个 Cockpit 的命名 key；具体账号由 Cockpit 依照额度、优先级、冷却和会话亲和选择。

必须保留以下规则：

- 同一个对话的后续请求保持会话亲和，不能因为额度变化在中途任意换号；
- 账号耗尽、失效或被限流时，返回结构化 `account_pool_unavailable`，不能悄悄改走 ChatGPT Web；
- 账号池规模、每账号并发和重试上限必须有硬上限；
- 号池统计只显示脱敏的账号 ID、计划和额度窗口；
- Star Moon 的导出、诊断和 ZIP 不能包含 Cockpit token、Claude cookie 或 sidecar manifest。

## Claude 接入分层

### 可做、优先做：Claude API/Anthropic Messages

Cockpit 已经有 Anthropic Messages 翻译路径。Star Moon 可以把它接成一个外部 provider，先把 Claude 的文本、工具调用、图片能力和流式语义映射到内部 `AdapterEvent`。这条路线使用明确的 API/网关凭据，能够做可重复的 contract test，也不会依赖网页 DOM。

### 可以研究、不能直接承诺：Claude Web 浏览器 adapter

Claude Web 理论上可以像 ChatGPT Web 一样做一个独立浏览器 adapter，但必须单独验证：登录面、会话 URL、composer、模型选择、附件、流式回复、停止/取消、MCP connector、Cloudflare/限流、重载和 compaction。不能把 ChatGPT 的 selector、cookie 形状、私有 endpoint 或消息协议复制过去。

Cockpit 的 `claude-desktop-auth-helper.cjs` 会读取 Claude cookies，并调用 `claude.ai` 的账户/组织私有接口来获取资料和额度。这可以证明“辅助器能读取账号资料”，不能证明“网页对话可作为生产模型代理”。Star Moon 不应导入或转存这些 cookie；如果以后做实验性浏览器路线，应把 cookie 留在独立 Electron partition，采用 page-owned session，且在每个私有接口和 DOM 阶段设置 origin、schema、大小、超时和取消校验。

在群星里，Claude 账号必须拥有独立的 `CL-*` 星身份，不得复用 GPT 的 partition、conversation key 或 connector 选择。Claude Web 的模型目录、composer、附件和 MCP 选择都要有自己的 adapter contract；“能登录”只证明星亮了，不证明它能在虚假之天里执行一整轮。

### MCP 嵌套

Claude 的 MCP 和 Star Moon 的 MCP 不应直接互相递归调用。推荐一个有方向的 broker：

```text
Claude/API or Claude Web adapter
       ▼
Claude tool boundary
       ▼  (allowlisted, depth=1, request id bound)
Star Moon MCP broker
       ▼
Codex tools / Cockpit tools
```

每次嵌套调用都要绑定外层 `thread_id`、`turn_id`、provider、tool namespace 和一次性 capability；禁止 `Claude → Star Moon → Claude` 循环，禁止把 Cockpit 的所有管理 API 自动暴露为 MCP。写操作继续走明确的审批和 allowlist。先做只读工具（models、quota、status、request log 摘要），再做低风险写操作。

## 分阶段落地和停止条件

1. **P0：外部网关接入** — 配置 Cockpit URL/key 指纹，真实 `/v1/models`、Chat Completions、Responses、compact、图片 generations/edits 和一条低风险请求通过；当前源码已经具备这些显式 provider 路径、脱敏 JSONL 证据和 profile rollback，但真实账号请求仍是 MISSING。
2. **P1：号池路由** — 证明 session affinity、额度耗尽、冷却、重启恢复和失败不回退。
3. **P2：Claude API** — Anthropic Messages 文本/工具/流式/图片 contract tests，通过后发布为实验 provider。
4. **P3：MCP broker** — 只读、深度 1、一次性 capability、循环检测和取消测试通过。
5. **P4：Claude Web 实验** — 仅在真实账号、重载、取消、限流、MCP 和会话保留矩阵通过后考虑；在此之前保持 `UNRESOLVED`，不作为生产路由。

若 Cockpit 网关没有真实可用的本地 key、`/v1/models` 或账号池健康证据，Star Moon 必须显示“未连接/待验证”，不能用进程存活、端口监听或静态 manifest 代替请求证据。

当前实现的请求证据只保存 provider、endpoint、上游模型名、HTTP 状态、耗时、字节数、完成/取消结果和短错误摘要；不会保存 prompt、图片内容、Cookie、refresh token、API key 或上游响应体。profile 更新会保留上一份 owner-only `.bak`，`cockpit rollback` 显式交换当前和上一份配置，且不会删除外部上游 key 文件。
