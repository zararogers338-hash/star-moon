# Star Moon 使用说明

这份源码是 Star Moon 5.0.2。它通过启动器内嵌的 ChatGPT 浏览器连接本地 Codex，默认使用普通的持久化 ChatGPT 对话。普通对话从 `https://chatgpt.com/` 开始，发送后会进入 `/c/<对话ID>`，因此可以在 ChatGPT 历史中搜索和继续；账户本身关闭聊天历史或工作区设置限制保留时，应用不能绕过这些设置。

## 1. 准备环境

源码包不包含 `node_modules`、编译产物和 `.git` 历史。请在目标机器解压后，从源码根目录执行：

```bash
bun --version
bun install --frozen-lockfile
bun install --cwd launcher --frozen-lockfile
```

项目锁定 Bun `1.4.0`。如果系统没有 Bun，请先安装 Bun 1.4.0，再执行上面的命令。依赖安装需要联网；安装过程中不要把密码、验证码、API key 或 bearer token 写进命令行。

## 2. 直接运行开发版

在源码根目录运行：

```bash
bun run app
```

或者只启动启动器开发界面：

```bash
bun run dev:launcher
```

第一次打开后，在 Star Moon 窗口中点击引导按钮，并在它拥有的 ChatGPT 页面完成普通登录。登录时只在本机窗口输入账号信息，不要把密码或验证码发给任何聊天机器人。

## 3. 生成安装包

必须在目标操作系统上打包，因为应用内置了与平台和架构绑定的 Bun 运行时。打包脚本会拒绝从 Linux 交叉生成 macOS 包，也不会把 Linux Bun 伪装成 macOS 运行时。

### macOS

在 macOS 13 或更高版本、与目标架构匹配的机器上运行：

```bash
bun run --cwd launcher package:mac
```

输出在 `launcher/artifacts/`，通常包括一个当前架构的 `.dmg` 和 `.zip`。项目目前默认生成未使用开发者证书签名的构建，Gatekeeper 可能显示警告；发布前需要在 macOS 上使用正式 Developer ID 重新签名和公证。

### Linux

在 Linux x64 桌面系统上运行：

```bash
bun run --cwd launcher package:linux
```

输出包括 `.deb`、`.rpm` 和 `.AppImage`。Debian/Ubuntu 可以这样安装：

```bash
sudo dpkg --install launcher/artifacts/star-moon-5.0.2-linux-amd64.deb
```

运行 AppImage 前先赋予执行权限：

```bash
chmod +x launcher/artifacts/star-moon-5.0.2-linux-x64.AppImage
./launcher/artifacts/star-moon-5.0.2-linux-x64.AppImage
```

同一次 Linux 打包还会生成 `.rpm`，供 Fedora、RHEL、openSUSE 等 RPM 系统使用：

```bash
sudo dnf install launcher/artifacts/star-moon-5.0.2-linux-x64.rpm
```

Windows x64、macOS Intel x64 和 Linux x64 的正式打包由 `.github/workflows/release.yml` 在对应 GitHub Actions runner 上完成。当前 Linux 本机可以真实构建 `.deb`/`.rpm`/`.AppImage`；Linux 不能把内置原生 Bun 伪装成 Windows 或 macOS 成品。

### Windows

在 Windows x64 上运行：

```powershell
bun run --cwd launcher package:win
```

输出的 NSIS 安装程序位于 `launcher/artifacts/`。Windows 构建需要在 Windows 主机上完成，不能直接拿 Linux 的内置运行时替代。

## 4. 验证构建

源码修改后，可以先运行静态检查和测试：

```bash
bun run typecheck
bun test tests/*.test.ts
bun test launcher/tests/*.test.cjs
```

打包成功只证明编译、安装文件和启动流程通过。真正使用前还要完成一次普通 ChatGPT 登录、发送一条无副作用的测试消息，并在关闭重开后从 ChatGPT 历史搜索同一条 `/c/<对话ID>`，以确认账户侧历史和会话续接。

## 5. Cockpit 外部网关

Cockpit 是可选的外部 provider。Star Moon 默认不会启用它，也不会复制 Cockpit 的浏览器 Cookie、OAuth refresh token、`auths/` 目录或账号池文件。先在 Cockpit 自己的界面配置合法账号池，再在 Star Moon 中只指向一个 loopback/HTTPS 网关和 owner-only 上游 key 文件：

```bash
bun run src/cli.ts cockpit configure \
  --base-url http://127.0.0.1:42421/v1 \
  --api-key-file /absolute/path/to/cockpit-client-key \
  --models gpt-5.6-sol,any/claude-opus
bun run src/cli.ts cockpit probe
bun run src/cli.ts cockpit status
bun run src/cli.ts cockpit evidence --limit 100
```

要把 Cockpit 的 account pool 和 GPT/Claude 路由嵌进同一个工作台，可以额外传一个 owner-only routing JSON。文件只保存账号公共元数据、上游地址、模型目录和 key 文件路径，key 本身仍留在独立的 0600 文件中：

```json
{
  "sessionAffinity": true,
  "accounts": [
    {"id":"gpt-account","label":"GPT pool member","provider":"gpt","enabled":true,"health":"ready","priority":0,"baseUrl":"https://cockpit.example.invalid/v1","apiKeyFile":"/owner-only/keys/gpt.key","models":["gpt-5.6-sol"]},
    {"id":"claude-account","label":"Claude pool member","provider":"claude","enabled":true,"health":"ready","priority":0,"baseUrl":"https://cockpit.example.invalid/v1","apiKeyFile":"/owner-only/keys/claude.key","models":["claude-opus"]}
  ],
  "routes": [
    {"id":"gpt-route","namespace":"gpt","provider":"gpt","accountIds":["gpt-account"],"models":["gpt-5.6-sol"],"strict":true},
    {"id":"claude-route","namespace":"claude","provider":"claude","accountIds":["claude-account"],"models":["claude-opus"],"strict":true}
  ]
}
```

保存时使用：

```bash
bun run src/cli.ts cockpit configure \
  --base-url http://127.0.0.1:42421/v1 \
  --api-key-file /absolute/path/to/cockpit-client-key \
  --models gpt-5.6-sol \
  --routing-file /absolute/path/to/cockpit-routing.json
```

路由模型会显示为 `cockpit/gpt/gpt-5.6-sol` 和 `cockpit/claude/claude-opus`。Star Moon 会在对应 provider 的 ready account 中按 priority 和 conversation/thread key 做确定性选择；没有 ready account、模型不在 route 或 provider 不匹配时直接失败，不会悄悄回退到另一种 provider。设置页的 Cockpit 面板会显示 GPT/Claude route 卡片，运行证据会显示最后使用的 provider、route 和模型。 Responses 请求中的 tools、`previous_response_id`、reasoning 和 stream 会原样保留给上游，只有 `cockpit/<namespace>/` 路由前缀会在上游边界移除。

`cockpit probe` 只把真实 `/v1/models` 返回的模型写入已验证目录；`cockpit evidence` 只输出脱敏的 endpoint、模型、状态、耗时、字节数和完成/取消结果。配置失败或网关没有账号时会保持失败状态，不会回退到 ChatGPT Web。保存新配置前会保留一份 `.bak`，需要时可以显式回滚：

```bash
bun run src/cli.ts cockpit rollback
```

目前 WebSocket Responses transport 仍保持明确的未启用闸门；真实账号支持的 `/v1/models`、文本流、图片、取消、重启恢复和账号亲和矩阵需要在隔离 Cockpit 环境中实际通过后，才会被标记为可用。

模型请求只允许使用已写入配置或由 `cockpit probe` 返回的 `cockpit/<model>` 目录。代理会拒绝上游重定向，并删除 Cookie、连接专用 header 和上游认证 header。证据的 `verified` 状态要求观察到协议完成信号：Responses 要有 `response.completed`/completed body，Chat Completions 要有非空 `finish_reason`，图片请求要有完成的图片结果；HTTP 200 或读到 EOF 本身不会升级状态。

## 6. 传输和安全边界

浏览器到 ChatGPT 使用 HTTPS。Full 模式的本地工具回连使用 OpenAI HTTPS Secure MCP Tunnel；本地 Responses 回环端口使用 `127.0.0.1` HTTP。普通聊天表示历史和会话语义，不表示关闭 HTTPS 或关闭所有加密。

浏览器 profile 和登录态属于敏感数据，只在可信机器上使用，不要打包、上传或共享 Star Moon 的用户数据目录。分发源码时只分发本源码包，不要把 `node_modules`、`launcher/build`、`launcher/artifacts` 或个人配置目录重新加入压缩包。
