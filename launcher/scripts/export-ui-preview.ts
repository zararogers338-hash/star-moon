import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// Bundle the same renderer plus the isolated, in-memory IPC fixture. No live
// Electron entry point or account configuration is loaded by this exporter.
const launcher = resolve(import.meta.dir, "..");
const outputPath = resolve(process.argv[2] ?? resolve(launcher, "preview-export/star-moon-preview.html"));
const cloudBytes = await Bun.file(resolve(launcher, "src/assets/cloudflare-cloud-cutout.png")).arrayBuffer();
const cloudDataUrl = `data:image/png;base64,${Buffer.from(cloudBytes).toString("base64")}`;
const build = await Bun.build({
  entrypoints: [resolve(launcher, "tests/ui-preview.ts")],
  target: "browser", format: "esm", minify: true, splitting: false,
  // This bundled Bun version emits an empty string for its dataurl loader.
  // Keep the PNG's actual bytes and alpha in an explicit inlined module.
  plugins: [{ name: "inline-preview-cloud", setup(builder) {
    builder.onLoad({ filter: /cloudflare-cloud-cutout\.png$/ }, () => ({
      contents: `export default ${JSON.stringify(cloudDataUrl)};`, loader: "js",
    }));
  } }],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!build.success) throw new AggregateError(build.logs, "Preview bundle failed");
const javascript = build.outputs.filter(file => file.path.endsWith(".js"));
const stylesheets = build.outputs.filter(file => file.path.endsWith(".css"));
if (javascript.length !== 1 || stylesheets.length !== 1) throw new Error("Expected one self-contained script and stylesheet");
const script = (await javascript[0]!.text()).replace(/<\/script/gi, "<\\/script");
if (!script.includes(cloudDataUrl)) throw new Error("The transparent cloud must be embedded in the offline preview");
const css = (await stylesheets[0]!.text()).replace(/<\/style/gi, "<\\/style");
if (/\bimport\s*["']/.test(script)) throw new Error("Preview must not contain external module imports");
await mkdir(dirname(outputPath), { recursive: true });
await Bun.write(outputPath, `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'" />
<title>星月计划 · 南极星实验室 · 离线界面预览</title>
<style>${css}</style>
</head>
<body style="background:#faf9f5">
<div id="root"></div>
<div style="position:fixed;bottom:3px;left:12px;font:10px sans-serif;color:#74643e;z-index:99999;pointer-events:none">UI PREVIEW · 离线模拟界面，不连接账号或运行时</div>
<script type="module">${script}</script>
</body>
</html>`);
console.log(JSON.stringify({ outputPath, bytes: Bun.file(outputPath).size, accountAccess: false, runtimeAccess: false }));
