import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { CatalogReadiness, catalogCopy } from "../src/CatalogReadiness";
import type { Language } from "../src/types";

test("all locales provide an explicit read-only check, no auto requests or success flags", () => {
  let calls = 0;
  for (const language of Object.keys(catalogCopy) as Language[]) {
    const html = renderToStaticMarkup(<CatalogReadiness language={language} api={{ catalogStatus: async () => { calls++; throw new Error("not during render"); } }} />);
    expect(html).toContain(catalogCopy[language].check);
    expect(html).toContain(catalogCopy[language].scope);
    expect(Object.keys(catalogCopy[language])).toEqual(Object.keys(catalogCopy.en));
  }
  expect(calls).toBe(0);
  const source = readFileSync(new URL("../src/CatalogReadiness.tsx", import.meta.url), "utf8");
  expect(source).not.toMatch(/(?:setupCore|smokeTest|setState|setInterval|setTimeout|guidedSetupComplete|codexCatalogVerified)/);
});
test("native catalog diagnostics remain guarded, and verification requires compatible current config", () => {
  const main = readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");
  const verifier = main.slice(main.indexOf("function startCatalogVerificationMonitor"), main.indexOf("async function restoreCodexRouteAfterRuntimeFailure"));
  expect(verifier).toContain('evidence.state !== "observed"');
  expect(verifier).toContain("generation !== catalogVerificationGeneration");
  expect(main).toContain('handle("launcher:catalog-status"');
});
