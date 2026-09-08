# Star Moon

Star Moon（星月计划）是一个本地 AI 工作台。它把 ChatGPT Web、Codex、MCP 和 Cockpit provider 路由放进同一套月夜叙事界面，同时把账号、浏览器、模型路由和诊断保持在可以检查、回滚、停止的边界内。

[![CI](https://github.com/zararogers338-hash/star-moon/actions/workflows/ci.yml/badge.svg)](https://github.com/zararogers338-hash/star-moon/actions)
[![Release](https://github.com/zararogers338-hash/star-moon/actions/workflows/release.yml/badge.svg)](https://github.com/zararogers338-hash/star-moon/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="HOW-TO-USE.md">使用说明</a>
</p>

## 工作方式

~~~mermaid
flowchart LR
  Codex[Codex task] --> Local[Star Moon local Responses bridge]
  Local --> Web[ChatGPT Web adapter]
  Local --> MCP[Turn-bound MCP]
  Local --> Cockpit[Cockpit route layer]
  Cockpit --> GPT[GPT account pool]
  Cockpit --> Claude[Claude account pool]
  Moon[MoonBook and launcher UI] --> Local
  Moon --> Cockpit
~~~

Star Moon 保留 Codex 的任务、上下文、工具和 MCP 生命周期。ChatGPT Web 使用独立的浏览器 profile；Cockpit 路由使用明确的模型 namespace 和 account pool。任何 provider 不可用时，路由会失败并留下诊断，不会静默切换到另一个 provider。

## 已嵌入的核心能力

- ChatGPT Web 路由：在本地 Responses bridge 中使用任务绑定的 ChatGPT Web 对话。
- MCP 与 Codex 工具：Full 模式下由 turn-bound capability 连接同一任务的工具；Browser-only 不会凭空获得本地工具。
- Cockpit GPT/Claude 路由：使用 cockpit/gpt/<model> 和 cockpit/claude/<model> namespace。
- Account pool：账号元数据、provider、健康、优先级、模型目录和独立 key 文件分开管理。
- 会话亲和：使用 conversation/thread key 做确定性账号选择；没有 ready 账号时严格失败，不跨 provider 回退。
- 多步 Responses 透传：tools、previous_response_id、reasoning、stream 和输入上下文保持原样，只在上游边界去掉 Star Moon 的路由前缀。
- 证据闸门：HTTP 200、进程存活或静态模型目录不会被当成模型成功；Responses、Chat Completions 和图片流必须出现协议级完成证据。
- 可回滚配置：Cockpit profile 原子写入并保留上一份配置；浏览器 profile、Codex route 和诊断文件保持隔离。
- 月夜界面：MoonBook、浏览器状态、MCP 引导、Cockpit route cards 和诊断统一使用 Star Moon 的 UI 语言。

## 路由示例

在 routing JSON 中定义 account pool 和 route：

~~~json
{
  "sessionAffinity": true,
  "accounts": [
    {
      "id": "gpt-account",
      "label": "GPT pool member",
      "provider": "gpt",
      "enabled": true,
      "health": "ready",
      "priority": 0,
      "baseUrl": "https://cockpit.example.invalid/v1",
      "apiKeyFile": "/owner-only/keys/gpt.key",
      "models": ["gpt-5.6-sol"]
    },
    {
      "id": "claude-account",
      "label": "Claude pool member",
      "provider": "claude",
      "enabled": true,
      "health": "ready",
      "priority": 0,
      "baseUrl": "https://cockpit.example.invalid/v1",
      "apiKeyFile": "/owner-only/keys/claude.key",
      "models": ["claude-opus"]
    }
  ],
  "routes": [
    {
      "id": "gpt-route",
      "namespace": "gpt",
      "provider": "gpt",
      "accountIds": ["gpt-account"],
      "models": ["gpt-5.6-sol"],
      "strict": true
    },
    {
      "id": "claude-route",
      "namespace": "claude",
      "provider": "claude",
      "accountIds": ["claude-account"],
      "models": ["claude-opus"],
      "strict": true
    }
  ]
}
~~~

保存到 Star Moon 的私有 profile：

~~~bash
bun run src/cli.ts cockpit configure \
  --base-url http://127.0.0.1:42421/v1 \
  --api-key-file /absolute/path/to/cockpit-client-key \
  --models gpt-5.6-sol \
  --routing-file /absolute/path/to/cockpit-routing.json
~~~

查看当前配置和最后一次 route evidence：

~~~bash
bun run src/cli.ts cockpit status
bun run src/cli.ts cockpit evidence --limit 100
~~~

## 开发

项目使用 Bun 1.4.0：

~~~bash
bun install --frozen-lockfile
bun install --cwd launcher --frozen-lockfile

bun run typecheck
bun test tests/*.test.ts
bun run --cwd launcher typecheck
bun run --cwd launcher test
bun run verify
~~~

UI 预览只使用内存模拟器，不连接账号或生产运行时：

~~~bash
bun run --cwd launcher dev:preview
~~~

打开 http://127.0.0.1:4187/tests/ui-preview.html?workbench&lang=zh-CN。预览页底部会显示 UI PREVIEW · 模拟界面，不连接账号或运行时。

## 平台打包

发布工作流会在对应 runner 上构建原生包：

- Windows x64：NSIS installer；
- macOS Intel x64：DMG 和 ZIP；
- Linux x64：AppImage、DEB 和 RPM。

Linux 本机可以构建 Linux 目标；Windows 和 macOS 必须在对应平台 runner 上构建，因为应用包含平台相关的 Bun runtime。推送版本 tag 后，GitHub Actions 会执行发布工作流：

~~~bash
git tag v5.0.2
git push origin v5.0.2
~~~

源码打包和手动上传步骤见 GITHUB-UPLOAD.md。

## 证据边界

Star Moon 不把静态配置、OAuth metadata、健康检查、工具目录或 UI 连接状态写成真实模型请求成功。

以下情况需要单独的真实账号矩阵：

- Cockpit GPT/Claude 的真实模型请求、流式完成、取消、重启恢复和 account affinity；
- ChatGPT Web 的登录、模型回合、MCP 工具回合和会话保留；
- Claude Web 的登录、模型选择、流式回复、取消、重载和 MCP；
- Responses WebSocket transport，目前保持显式关闭。

这类证据未完成时，状态会保持 MISSING、OBSERVED 或 UNVERIFIED，不会被打包或 UI 文字伪装成通过。

## 安全边界

- 不要把浏览器 storage state、Cookie、refresh token、API key、MCP bearer token 或 .env 文件提交到仓库。
- 上游 key 放在 owner-only 文件中；routing JSON 只保存 key 文件路径。
- Cockpit 不复制账号池的 auths/ 目录。
- 代理拒绝上游重定向并过滤 Cookie、连接专用 header 和上游认证 header。
- 本项目是独立软件，不代表 OpenAI、Anthropic、Cockpit 或其他 provider。

更多说明：

- HOW-TO-USE.md
- docs/security-model.md
- docs/technical-roadmap.md
- docs/cockpit-tools-integration.md
- TROUBLESHOOTING.md
- CONTRIBUTING.md

## License

MIT. See LICENSE.

