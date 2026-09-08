# 手动上传到 GitHub

这份源码包已经排除了 `node_modules`、编译产物、浏览器状态、账号密钥、OAuth token、`.env` 文件和 `.git` 历史。你可以先在 GitHub 网页创建一个空仓库，再在解压后的源码根目录执行：

```bash
git init
git add .
git commit -m "Star Moon 5.0.2"
git branch -M main
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

把 `OWNER/REPOSITORY` 换成你刚创建的仓库路径。不要把密码、验证码、Personal Access Token 或 SSH 私钥写进命令、文件或聊天内容；如果 GitHub 要求认证，请在本机的 Git Credential Manager、SSH agent 或 GitHub CLI 登录提示中完成。

发布构建已经写入 `.github/workflows/release.yml`：

- Windows x64：NSIS installer；
- macOS Intel x64：DMG 和 ZIP；
- Linux x64：AppImage、DEB 和 RPM。

推送 `v5.0.2` tag 后，GitHub Actions 会在对应 runner 上构建平台原生包。当前 Linux 主机不会伪造 Windows 或 macOS 成品；本地能直接验证的内容是源码、Linux 构建契约、测试和发布工作流配置。
