import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { CodexCopiesPanel, copiesCopy } from "../src/CodexCopies";
import type { Language, LauncherApi } from "../src/types";
test("copy generation is explicit, localized and disabled in previews", () => {
  let calls = 0;
  const api = new Proxy({}, { get: () => { calls++; throw new Error("No native calls while rendering"); } }) as LauncherApi;
  for (const language of Object.keys(copiesCopy) as Language[]) {
    const html = renderToStaticMarkup(<CodexCopiesPanel api={api} language={language} preview />);
    expect(html).toContain(copiesCopy[language].title);
    expect(html).toContain(copiesCopy[language].preview);
    expect(html).toContain("disabled");
    expect(Object.keys(copiesCopy[language])).toEqual(Object.keys(copiesCopy.en));
  }
  expect(calls).toBe(0);
});
test("all copy entry points use trusted native frame registration", () => {
  const main = readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  for (const action of ["list", "create", "inspect", "open", "archive", "folder"]) expect(main).toContain(`trustedHandle("launcher:codex-copies-${action}"`);
});
