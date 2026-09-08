# 橘子云素材记录

2026-09-05。用于月之书中用户指定的 Cloudflare／“橘子云”情景，不代表商业合作、赞助或服务故障归责。

- 原始素材：用户提供的 Cloudflare JPEG；开发副本中保留为 `launcher/src/assets/cloudflare.jpg`。
- 项目采用素材：`launcher/src/assets/cloudflare-cloud-cutout.png`，1859×846、RGBA PNG。
- 处理方式：内置图像编辑工具（imagegen 技能，background-extraction），非 CLI/API 密钥调用。
- 处理范围：透明背景，仅保留橘色云形，去除白底与黑色字标；这是根据原图生成的抠图素材，不声称像素级无损或官方提供的透明商标文件。
- 已检查透明度范围为 0–255，657,478 个像素完全透明。页面元素使用透明背景、无边框、无矩形阴影。
- 原文件与生成原件均保留；不覆盖用户原图。生成原件在 `/home/summer/.codex/generated_images/01a06cf8-b073-74a3-99ab-16bcbea3067d/exec-30c2a4d6-fd3f-4d7f-896b-e6789dbb0f41.png`。
- Cloudflare 名称及标志属于其权利人；项目不将第三方标志署名为自己的原创。其他原项目许可证与署名保留。

## 实际编辑提示词

```text
Use case: background-extraction.
Asset type: transparent PNG cutout for an animated website overlay.
Input image 1 is the EDIT TARGET: the provided Cloudflare logo JPEG.
Primary request: extract ONLY the two-tone orange Cloudflare cloud mark from the top of this image onto a genuinely transparent RGBA background. Remove all of the surrounding white background and remove the black CLOUDFLARE wordmark beneath it. Keep the exact original cloud silhouette, the relative positions and proportions of its two orange parts, its original orange colors, and all delicate horizontal cutout gaps. The white gaps inside the logo must become transparent negative space as well. This is a faithful cutout of the existing mark, not a redesign.
Composition: close crop around the complete cloud mark with only a small even transparent safety margin, wide landscape aspect ratio approximately 2.2:1.
Constraints: true alpha transparency, no white rectangle, no checkerboard baked into pixels, no letters or text, no new shapes, no outline, no halo, no shadow, no glow, no background, no restyling. Preserve clean antialiased edges and flat original colors.
```

## 地址说明的来源与边界

- 域名通过 Tunnel 映射到仍在运行的本地服务，买域名并不等于部署 MCP：[Cloudflare Tunnel 官方说明](https://developers.cloudflare.com/tunnel/)。
- Quick Tunnels 不支持 SSE，定位为试用而非生产保证；临时地址不能未经验证就承诺支持所有 MCP 传输：[Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)。
- 当前内置 Bun 的 `dataurl` loader 曾将 PNG 导出为空字符串，已改为显式构建插件生成 base64 模块，并断言完整 PNG 字节已内嵌；查看离线页时不请求第三方图片。构建接口参考：[Bun bundler](https://bun.sh/docs/bundler)。

页面不会写“服务全球 70% 网站”等未核实数字，也不会因为一个超时就要求用户购买域名。目前橘子云故障演出仅由明确标注的预览场景触发；实际诊断不会把未知故障归因于 Cloudflare，只有原生适配器的当前连接证据才可成为 MCP 握手成功状态。
