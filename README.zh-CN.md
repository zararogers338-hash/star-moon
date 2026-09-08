<h1 align="center">ChatGPT Web for Codex</h1>

<p align="center">
  <strong>将 ChatGPT Web（包括 Pro）作为 Codex 原生模型使用。</strong><br>
  切换模型档位，保留原有工作流。
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="TROUBLESHOOTING.md">故障排除</a> · <a href="SECURITY.md">安全</a> · <a href="CONTRIBUTING.md">贡献</a>
</p>

<p align="center">
  <a href="https://github.com/miuuyy/codex-chatgpt-web/actions/workflows/ci.yml"><img src="https://github.com/miuuyy/codex-chatgpt-web/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/macOS-arm64%20%7C%20x64-black?logo=apple" alt="macOS arm64 and x64">
  <img src="https://img.shields.io/badge/Windows-x64-0078d4?logo=windows11" alt="Windows x64">
  <img src="https://img.shields.io/badge/Linux-x64-fcc624?logo=linux&logoColor=black" alt="Linux x64">
  <img src="https://img.shields.io/badge/Free_AI-no_API_fees-10a37f" alt="Free AI with no API fees">
</p>

Free 和 Go 账户会在 Codex 原生模型选择器中看到 **ChatGPT Web — Luna**。具有推理选择器的
账户仍会按订阅权限看到 **Instant**、**Medium**、**High**、**Extra High** 和 **Pro**。
桥接程序会把当前编译后的 Codex 任务上下文发送到普通的持久 ChatGPT 对话，附加图片，
并将可见的推理过程、工具活动和 Markdown 流式传回同一个 Codex 任务。

<p align="center">
  <img src="assets/demo.gif" alt="ChatGPT Web 实时轮次正在使用原生 Codex harness" width="960">
</p>

```text
Codex task ──Responses + SSE──▶ codex-chatgpt-web ──embedded browser──▶ ChatGPT
     ▲                                │                                      │
     └──────── native UI, context, images, tracing, and tool lifecycle ──────┘
```

Codex 会保留原生任务、上下文生命周期、界面和工具 harness。本地 Responses 桥接程序只会将
所选模型的任务转发到与该任务绑定的普通 ChatGPT 对话；在完整模式下，MCP 会把 ChatGPT 连接回
同一个 Codex 任务的工具，直到下一次上下文压缩边界。

> [!TIP]
> 我还开发了 **[ChatGPT Persona Voice](https://github.com/miuuyy/ChatGPT-Persona-Voice)**：一款
> 能够近实时改变 ChatGPT/Codex 声音的本地应用。它不会接触你的账户、浏览器会话或 ChatGPT
> 请求，因此不会带来账户封禁风险。如果你喜欢我的作品，欢迎试用。

## 亮点

- **Codex 原生模型。** ChatGPT Web 直接出现在 Codex 模型选择器中，同时保留原有任务界面、
  上下文生命周期、流式输出、追踪和工具展示。
- **通过 MCP 使用完整 Codex harness。** 完整模式支持登录账户公开的全部 effort（包括 Pro），
  并可访问当前任务的文件系统、shell、图片、审批以及已配置的工具和应用。
- **连续任务会话与原生上下文压缩。** 连续消息会复用同一个与任务绑定的持久对话。到达上下文
  边界时，保留的 agent 会先写出检查点，再由 Codex 从干净聊天继续；若该私有聊天已被关闭，
  则使用 Codex 的规范任务历史作为回退来源。
- **统一的跨平台启动器。** macOS、Windows 和 Linux 应用统一管理登录、模型设置、MCP 指南、
  健康检查、安全诊断以及最多五个可见的任务绑定浏览器标签页。
- **故障时明确失败。** 模型、工具缺失或 ChatGPT UI 发生变化时会返回明确错误，而不会静默切换
  路由或能力。端到端覆盖范围记录在[发布验证](docs/release-validation.md)中。
- **可选的普通浏览器伴侣。** 启动器提供固定版本的 MIT 许可
  [Chat On Steroids 浏览器扩展集成说明](docs/integrations/chat-on-steroids.md)。用户可以在普通
  Chrome/Chromium 中手动加载它；扩展不会自行获得本地文件、Shell、审批或 MCP 权限。

启动器使用你已登录的 ChatGPT 账户及普通对话历史。提示仍会由 OpenAI 处理，并受账户设置及
OpenAI 条款约束。本项目为非官方项目；用户仍需自行遵守适用的 OpenAI 条款和工作区政策。

这里的“普通/持久”说的是对话会留在 ChatGPT 历史中，不是“关闭加密”。运行时只使用
`https://chatgpt.com/` 及其普通 `/c/<对话ID>` 页面，并拒绝 `temporary-chat=true`、登录页、设置页
和后端地址作为可恢复会话。浏览器到 ChatGPT 仍走正常 HTTPS；本地 Responses 回环端口是
`127.0.0.1` 的 HTTP，完整模式的本地工具回连使用 OpenAI 的 HTTPS Secure MCP Tunnel。

## 快速开始

这个源码包没有已确认的公开 Star Moon 发布仓库，因此不会默认启用下载或自动更新源。请按
[`HOW-TO-USE.md`](HOW-TO-USE.md) 从源码构建运行；如果你有自己的发布仓库，再显式设置仓库名后
使用下面的校验和安装器。这样可以避免把存储路径和路由身份不同的上游 Codex Web GPT 二进制
误装到 Star Moon 上。

**macOS 或 Linux**

```bash
export STAR_MOON_REPOSITORY=OWNER/REPO
curl -fsSL "https://github.com/$STAR_MOON_REPOSITORY/releases/latest/download/install-star-moon.sh" \
  | STAR_MOON_REPOSITORY="$STAR_MOON_REPOSITORY" sh
```

**Windows PowerShell**

```powershell
$env:STAR_MOON_REPOSITORY = "OWNER/REPO"
irm "https://github.com/$env:STAR_MOON_REPOSITORY/releases/latest/download/install-star-moon.ps1" | iex
```

然后在应用中完成三项检查：

1. 直接在启动器内置的 ChatGPT 浏览器中登录。登录页和身份提供商窗口都保留在同一个由启动器
   管理的私有浏览器配置中；会话不会在不同浏览器之间复制。
2. 运行浏览器冒烟测试。
3. 点击 **安装模型**，重启一次 Codex，然后选择一个 **ChatGPT Web — …** 模型。

启动器会在设置期间检测当前账户的 ChatGPT 控件：Free/Go 账户只会显示 Luna；只有已登录账户
支持 Pro 时，Pro 才会显示。独立的 **MCP** 页面是可选项，它会在不需要终端命令的情况下引导你
完成完整 harness 设置。

打包后的启动器在其内置浏览器中完成登录并运行 ChatGPT 模型轮次，不需要模型 API 密钥、已安装的
Chrome/Chromium、系统级 Node/Bun，也不会由本项目另行下载浏览器。

**从源码运行**

```bash
git clone https://github.com/miuuyy/codex-chatgpt-web.git && \
cd codex-chatgpt-web && \
bun run app
```

源码方式需要 Bun 1.4.0。该命令会安装锁定版本的依赖并打开应用。

## 模式

| 模式 | 模型 | 本地 Codex 工具 | 额外设置 |
| --- | --- | --- | --- |
| **仅浏览器** | Free/Go：Luna；Plus：Instant–High；Pro：增加 Extra High 和 Pro | 不可用；Codex 会显示警告 | 无 |
| **完整 harness** | Free/Go：Luna；Plus：Instant–High；Pro：增加 Extra High 和 Pro | 每个列出的 effort 均支持，包括 Pro | OpenAI 隧道 + ChatGPT 连接器 |

模型选择器中的每一项都对应一个固定的 ChatGPT 模式。Codex 仍会显示内置的 Effort 和 Speed
选项，但更改它们不会在后台静默切换所选的浏览器模型。在完整模式下，每一个可用 effort 都会
获得同一个与当前回合绑定的 MCP 能力；Pro 没有单独限制，也没有缩减后的工具契约。

## 完整 harness

完整模式通过官方
[OpenAI tunnel-client](https://github.com/openai/tunnel-client)
将 ChatGPT 的工具调用连接回当前 Codex 任务。该隧道为出站连接：不会暴露公网 IP、开放入站端口，
也不需要配置路由器端口转发。

> **限制**
>
> 有关 **GPT-5.6 Sol Pro** 和 **GPT-6 Astra** 当前的 ChatGPT 消息额度，请参阅
> [Limits](https://github.com/miuuyy/codex-chatgpt-web/discussions/309)。Token 上下文上限取决于
> 账户类型和所选 effort。Plus 的 Medium/High 使用实测的 90,000-token 窗口；启用实验性的
> **3× context** 后最高为 270,000 tokens，并且全程支持原生 Codex compaction。

1. 完成启动器中的必需设置。
2. 在启动器中打开 **MCP**。请在将使用 ChatGPT 连接器的同一个 OpenAI 账户中创建 Tunnel
   和普通 API 密钥；创建密钥本身免费，也不会消耗模型 API 额度。
3. 粘贴 Tunnel ID 和 API 密钥，然后点击 **连接 Harness**。
4. 在 ChatGPT 设置中启用 **开发者模式**。新建连接器时选择 **Tunnel**，选择刚创建的
   Tunnel，将 **身份验证** 设为 **无**，并将名称准确设置为 **Codex Native2**。
5. 在 **Codex Native2** 的 **权限** 中选择 **允许所有操作**；**允许低风险操作** 会在命令和
   补丁到达本地运行时前将其拦截。外层 Codex harness 仍会执行沙箱和审批规则。
6. 运行 **验证运行时**，确认 **Codex Native2** 已连接并可用。

写入/修改操作还需要 ChatGPT 工作区及其管理员政策允许。请参阅
[开发者模式和 MCP 应用](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt)。
除非显式启用 `--auto-approve-tool-calls`，否则意外的审批提示会直接失败；该选项只会点击
**Allow once**，绝不会授予永久权限。

## 日常操作

使用 **活动** 页面查看安全的本地诊断，并通过 **设置 → 运行诊断** 执行端到端健康检查。设置页还可
取消保留的浏览器任务，或在卸载前移除 Codex 集成。仅在需要为每个浏览器检查点保存截图时设置
`CODEX_CHATGPT_WEB_BROWSER_DIAGNOSTICS=1`。

新安装默认使用 **Compatibility V1** 以支持跨后端 subagent。**Native** 会保留 Codex 自身的
功能设置，并启用明文 Web-to-Web V2 委派。切换协议后，请重启 Codex 并创建新任务：

```bash
codex-chatgpt-web subagents status
codex-chatgpt-web subagents compatibility-v1
codex-chatgpt-web subagents native
```

## 限制和安全性

- 这是非官方浏览器自动化，并非 OpenAI API。ChatGPT UI 变更可能破坏选择器；发生变化时会明确
  失败，而不是静默切换模型或传输方式。
- 浏览器状态是敏感的登录凭据，loopback 监听器也可被同一本地用户运行的进程访问。切勿共享
  启动器 profile，并仅在可信工作站上使用。
- 发布包目前支持 macOS 13+（arm64/x64）、Windows x64 和 Linux x64。运行时、测试和打包会在
  CI 中对三种系统进行检查；依赖账户的浏览器与 MCP 流程使用单独的
  [发布验证](docs/release-validation.md)。
- 构建目前尚未进行平台签名，因此 Gatekeeper 或 SmartScreen 可能会显示警告。安装程序会在安装前
  验证已发布的 SHA-256 清单。

启用完整模式前，请阅读完整的[架构说明](docs/architecture.md)和
[安全模型](docs/security-model.md)。安全漏洞请通过 [SECURITY.md](SECURITY.md) 报告。

## 开发

```bash
bun run app
bun run dev:launcher
bun run src/cli.ts dev status
bun run dev:chat compaction-lab "Reply with exactly: DEV READY"
bun run verify
bun run smoke:subagents
bun run app:package
```

`dev:launcher` 会在 `~/.codex-chatgpt-web-dev` 下启动第二个独立的启动器配置：Electron 状态、
浏览器 Cookie/登录、ChatGPT 账户、配置、沙箱化 `CODEX_HOME`、聊天、诊断、broker 和 tunnel
配置均与正式启动器隔离。它可以与正式启动器同时运行，绝不会启动 Responses daemon 或修改
Codex。可选的完整模式只会启动并监管隔离的 DEV MCP tunnel，并使用独立连接器名称
`Codex Native2 DEV`。

`dev:chat` 是一个具名、持久的合成外层 Codex harness。它通过隔离的启动器浏览器、普通持久对话、
prompt compiler、Responses parser 和压缩处理器执行当前工作树。可选的完整模式也会测试 MCP
连接器和 broker；工具效果会显示为明确的模拟回执。仅浏览器聊天不会暴露外层工具。该命令不会
打开 Responses listener、修改 `openai_base_url`、停止正式 daemon，也不会占用 17841 端口。
不带消息运行时，可使用 `/status`、`/fill 30000`、`/compact`、`/model` 和 `/reset`。首次使用时，
请在标有 **DEV** 的窗口中登录并初始化一次配置。完整模式仅用于模拟工具轮次；DEV 启动器会保持
DEV tunnel 就绪，具名聊天按需连接 broker。正式凭据和 `Codex Native2` 连接器绝不会被隐式复用。
详见 [DEV chat harness](docs/dev-chat.md)。

在 Linux 上构建 AppImage 还需要先准备固定版本的 `libnotify` 和自有 AppImage 工具集，具体命令见
[Ubuntu 打包说明](docs/ubuntu-packaging.md)；如果最终 ABI 没有通过验证，打包器会拒绝发布 AppImage。

- [架构说明](docs/architecture.md)
- [DEV chat harness](docs/dev-chat.md)
- [安全模型](docs/security-model.md)
- [故障排除](TROUBLESHOOTING.md)
- [贡献指南](CONTRIBUTING.md)

## Star History

<a href="https://www.star-history.com/?repos=miuuyy%2Fcodex-chatgpt-web&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=miuuyy/codex-chatgpt-web&type=date&theme=dark&legend=top-left&sealed_token=hBVvg_eOjfMFDrfyeo5FPQkIwcvBEmXc6F7ZoOKnfFE4KPCs67o34w4XwVuM-bHGnKR-SKCAN_TSTWrzuqSBNU-RjNZCLT4f-xNs9qcDhciQtemxHKuuFj0N5YNqZIihdaQfakrh2ANhOrvP0K2LmLXX2zbsYyVaYZknyTnlYeIS_mOGvMcO32ZmPCHK">
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=miuuyy/codex-chatgpt-web&type=date&legend=top-left&sealed_token=hBVvg_eOjfMFDrfyeo5FPQkIwcvBEmXc6F7ZoOKnfFE4KPCs67o34w4XwVuM-bHGnKR-SKCAN_TSTWrzuqSBNU-RjNZCLT4f-xNs9qcDhciQtemxHKuuFj0N5YNqZIihdaQfakrh2ANhOrvP0K2LmLXX2zbsYyVaYZknyTnlYeIS_mOGvMcO32ZmPCHK">
    <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=miuuyy/codex-chatgpt-web&type=date&legend=top-left&sealed_token=hBVvg_eOjfMFDrfyeo5FPQkIwcvBEmXc6F7ZoOKnfFE4KPCs67o34w4XwVuM-bHGnKR-SKCAN_TSTWrzuqSBNU-RjNZCLT4f-xNs9qcDhciQtemxHKuuFj0N5YNqZIihdaQfakrh2ANhOrvP0K2LmLXX2zbsYyVaYZknyTnlYeIS_mOGvMcO32ZmPCHK">
  </picture>
</a>

## 免责声明

本项目是独立软件，与 OpenAI 无关联，也未获得 OpenAI 背书。请仅使用自己的账户，并遵守适用的
[使用条款](https://openai.com/policies/terms-of-use/)和工作区政策；本项目不会绕过身份验证或
访问控制。
