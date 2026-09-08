import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MoonBook, MoonConnection, MoonRouteGuide, MoonSignal } from "../src/MoonBook";
import { moonBookCopy } from "../src/moon-book-copy";
import { connectionFromAgentDock, connectionFromDoctor } from "../src/moon-connection";
import { onboardingLanguages } from "../src/onboarding-presentation";
import { copyFor } from "../src/i18n";

test("journey shell has three primary paths without an old sidebar or literal book spine", () => {
  const html = renderToStaticMarkup(<MoonBook copy={copyFor("zh-CN")} language="zh-CN" surface="connection" navigate={() => {}} version="preview"><p>Page</p></MoonBook>);
  expect(html).toContain("星月计划");
  expect(html).not.toContain("moon-book-binding");
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  expect(html.match(/<button/g)).toHaveLength(7); // six bookmarks and moon switch
  expect(html).not.toMatch(/app-sidebar|sidebar-nav|AntarcticStar|antarctic-star/);
  expect(html).toContain('aria-label="书中章节"');
});

test("local health is never promoted into authenticated handshake success", () => {
  expect(connectionFromDoctor({ok:true,checks:[]})).toEqual({state:"local-ready"});
  expect(connectionFromDoctor({ok:true,checks:[{id:"connector",status:"warning",message:"unverified"}]}).state).toBe("local-ready");
  expect(connectionFromDoctor({ok:true,checks:[{id:"login",status:"error",message:"expired"}]}).state).toBe("error");
  expect(connectionFromDoctor({ok:false,checks:[{id:"proxy",status:"error",message:"request timed out"}]})).toEqual({state:"timeout",cause:"local",detail:"proxy: request timed out"});
  expect(connectionFromDoctor({ok:false,checks:[{id:"tunnel-runtime",status:"error",message:"timeout"}]}).cause).toBe("tunnel");
  expect(connectionFromDoctor({ok:false,checks:[{id:"login",status:"error",message:"session expired"}]}).cause).toBe("auth");
});

test("all seven languages preserve the poetic lines and factual boundaries", () => {
  for (const { value: language } of onboardingLanguages) {
    expect(Object.keys(moonBookCopy[language]).sort()).toEqual(Object.keys(moonBookCopy.en).sort());
    for (const value of Object.values(moonBookCopy[language])) expect(value.trim()).not.toBe("");
    expect(moonBookCopy[language].temporaryBody).toContain("SSE");
  }
  expect(moonBookCopy["zh-CN"].dimmed).toBe("月光变得暗淡，但是并没有消失");
  expect(moonBookCopy["zh-CN"].success).toBe("月神回应了你的祈祷");
  expect(moonBookCopy["zh-CN"].timeoutDetail).toBe("您的连接握手已超时");
});

test("preview offers both demonstrations; production offers only actual local checks", () => {
  const shared = {language:"zh-CN" as const,probe:async () => ({ok:true,checks:[]}),onRepair:() => {}};
  const preview = renderToStaticMarkup(<MoonConnection {...shared} preview />);
  const live = renderToStaticMarkup(<MoonConnection {...shared} preview={false} />);
  expect(preview).toContain("演示：握手成功");
  expect(preview).toContain("演示：橘子云超时");
  expect(preview).toContain("不代表真实连接");
  expect(live).not.toContain("演示：");
  expect(live).toContain("这里握手成功，不等于网页对话已能调用它的工具");
  expect(live).toContain("测试连接");
});

test("signal artwork has unique masks and respects reduced motion", () => {
  const html = renderToStaticMarkup(<><MoonSignal result={{state:"ready"}} reducedMotion/><MoonSignal result={{state:"timeout"}} reducedMotion/></>);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
  expect(html).toContain('opacity="0.28"');
  expect(html).not.toContain("<ellipse");
  const css = readFileSync(new URL("../src/moon-book.css",import.meta.url),"utf8");
  expect(css).toContain("prefers-reduced-motion:reduce");
  expect(css).not.toContain("infinite");
});

test("address guidance distinguishes a domain from a server and keeps unbuilt routes labelled", () => {
  const html = renderToStaticMarkup(<MoonRouteGuide language="zh-CN"/>);
  expect(html).toContain("安装分支仍待接入");
  expect(html).toContain("买域名不等于买好了服务器");
  expect(renderToStaticMarkup(<MoonRouteGuide language="zh-CN" initialRoute="temporary"/>)).toContain("不支持 SSE");
  expect(html).toContain("VPS + HTTPS");
  expect(html).not.toContain("70%");
});

test("AgentDock authorization alone does not become a handshake receipt", () => {
  const base = {url:"https://example.test/mcp",publicUrl:"",state:"authorized",authenticated:true,tools:[]};
  expect(connectionFromAgentDock(base)).toMatchObject({state:"error",cause:"auth"});
  expect(connectionFromAgentDock({...base,state:"connected"})).toEqual({state:"ready"});
  expect(connectionFromAgentDock({...base,state:"timeout"})).toMatchObject({state:"timeout",cause:"unknown"});
});

test("orange cloud uses an RGBA PNG without a rectangular image frame", () => {
  const png = readFileSync(new URL("../src/assets/cloudflare-cloud-cutout.png", import.meta.url));
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(png[25]).toBe(6); // PNG color type 6: RGBA, not an opaque RGB background.
  const source = readFileSync(new URL("../src/MoonBook.tsx", import.meta.url), "utf8");
  expect(source).toContain('import cloudflareCloud from "./assets/cloudflare-cloud-cutout.png"');
  expect(source).not.toContain("cloudflare.jpg");
  const css = readFileSync(new URL("../src/moon-book.css", import.meta.url), "utf8");
  const imageRule = css.match(/\.moon-orange-cloud img \{([^}]+)\}/)?.[1] ?? "";
  expect(imageRule).toContain("background:transparent");
  expect(imageRule).toContain("box-shadow:none");
});
