import { expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  codexInterruptHookCommand,
  codexInterruptHookHash,
  installCodexInterruptHook,
  MANAGED_INTERRUPT_HOOK_END,
  restoreCodexInterruptHook,
  verifyCodexInterruptHook,
  verifyCodexInterruptHookRestored,
} from "../src/codex-interrupt-hook";

test("installs one narrowly trusted Interrupt hook and restores the exact Codex config", () => {
  const original = [
    'model = "gpt-5.6-sol"',
    "",
    "[[hooks.Interrupt]]",
    "[[hooks.Interrupt.hooks]]",
    'type = "command"',
    'command = "existing-hook"',
    "",
  ].join("\n");
  const config = { runtimeCommand: ["/opt/Codex Web/runtime/bun", "/opt/Codex Web/app/cli.js"] };
  const installed = installCodexInterruptHook(original, "/Users/test/.codex/config.toml", config);

  expect(installed.installed.groupIndex).toBe(1);
  expect(installed.installed.stateKey).toBe(`${resolve("/Users/test/.codex/config.toml")}:interrupt:1:0`);
  expect(installed.text).toContain('[[hooks.Interrupt]]');
  expect(installed.text).toContain(`[hooks.state.${JSON.stringify(installed.installed.stateKey)}]`);
  expect(installed.text).toContain(`trusted_hash = ${JSON.stringify(installed.installed.trustedHash)}`);
  verifyCodexInterruptHook(installed.text, installed.installed);
  expect(restoreCodexInterruptHook(installed.text, installed.installed)).toBe(original);
  verifyCodexInterruptHookRestored(original);
});

test("trusts the canonical Codex config path before a new config file exists", () => {
  const directory = mkdtempSync(join(tmpdir(), "codex-interrupt-hook-"));
  try {
    const configPath = join(directory, "config.toml");
    const installed = installCodexInterruptHook("", configPath, { runtimeCommand: ["/opt/runtime"] });
    expect(installed.installed.stateKey).toBe(
      `${join(realpathSync.native(directory), "config.toml")}:interrupt:0:0`,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Interrupt hook command is absolute, quoted, and bound to the exact application home", () => {
  expect(codexInterruptHookCommand(
    { runtimeCommand: ["/Applications/Codex Web GPT.app/runtime/bun", "/Applications/Codex Web GPT.app/app/cli.js"] },
    "/Users/test/Application Support/Codex Web GPT",
    "darwin",
  )).toBe(
    "'/Applications/Codex Web GPT.app/runtime/bun' '/Applications/Codex Web GPT.app/app/cli.js'"
      + " '--home' '/Users/test/Application Support/Codex Web GPT' 'hook' 'interrupt'",
  );
  expect(codexInterruptHookCommand(
    { runtimeCommand: ["C:\\Program Files\\Codex Web GPT\\bun.exe", "C:\\Program Files\\Codex Web GPT\\cli.js"] },
    "C:\\Users\\test\\Codex Web GPT",
    "win32",
  )).toBe(
    '"C:\\Program Files\\Codex Web GPT\\bun.exe" "C:\\Program Files\\Codex Web GPT\\cli.js"'
      + ' "--home" "C:\\Users\\test\\Codex Web GPT" "hook" "interrupt"',
  );
});

test("Interrupt hook trust hash is deterministic and changes with its exact command", () => {
  const first = codexInterruptHookHash("'runtime' 'hook' 'interrupt'");
  expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(codexInterruptHookHash("'runtime' 'hook' 'interrupt'")).toBe(first);
  expect(codexInterruptHookHash("'other-runtime' 'hook' 'interrupt'")).not.toBe(first);
});

test("refuses to remove a modified or duplicated managed hook", () => {
  const original = 'model = "gpt-5.6-sol"\n';
  const installed = installCodexInterruptHook(
    original,
    "/Users/test/.codex/config.toml",
    { runtimeCommand: ["/opt/runtime"] },
  );
  const modified = installed.text.replace("timeout = 3", "timeout = 2");
  expect(() => restoreCodexInterruptHook(modified, installed.installed)).toThrow("changed after setup");
  const reordered = [
    "[[hooks.Interrupt]]",
    "[[hooks.Interrupt.hooks]]",
    'type = "command"',
    'command = "new-earlier-hook"',
    "",
    installed.text,
  ].join("\n");
  expect(() => restoreCodexInterruptHook(reordered, installed.installed)).toThrow("order changed after setup");
  expect(() => installCodexInterruptHook(installed.text, "/Users/test/.codex/config.toml", { runtimeCommand: ["/opt/runtime"] }))
    .toThrow("already contains");
});

for (const ending of ["\n", "\r\n", "\r"]) {
  for (const missingEnd of [false, true]) {
    test(`verified foreign hook migrates reversibly (${JSON.stringify(ending)}, missingEnd=${missingEnd})`, () => {
      const configPath = "/test/codex/config.toml";
      const old = installCodexInterruptHook(`model = "existing"${ending}`, configPath, { runtimeCommand: ["/old/runtime"] });
      const original = (missingEnd ? old.text.replace(MANAGED_INTERRUPT_HOOK_END, "") : old.text)
        + `${ending}[model_providers.user]${ending}name = "preserved"${ending}`;
      const next = installCodexInterruptHook(original, configPath, { runtimeCommand: ["/new/runtime"] }, true);
      expect(next.installed.groupIndex).toBe(0);
      expect(next.installed.previousFragment).toBeTruthy();
      expect(next.text.match(/\[\[hooks\.Interrupt\]\]/g)).toHaveLength(1);
      verifyCodexInterruptHook(next.text, next.installed);
      expect(restoreCodexInterruptHook(next.text, next.installed)).toBe(original);
      verifyCodexInterruptHookRestored(original, next.installed);
      expect(() => verifyCodexInterruptHookRestored(original.replace("/old/runtime", "/changed/runtime"), next.installed)).toThrow();
    });
  }
}

test("explicit replacement still refuses tampered, duplicate, untrusted and unbounded legacy blocks", () => {
  const configPath = "/test/codex/config.toml";
  const original = installCodexInterruptHook("", configPath, { runtimeCommand: ["/old/runtime"] }).text;
  for (const broken of [
    original.replace("timeout = 3", "timeout = 4"),
    original.replace("/old/runtime", "/untrusted/runtime"),
    original.replace(":interrupt:0:0", ":interrupt:1:0"),
    original + original,
    original.replace(MANAGED_INTERRUPT_HOOK_END, 'enabled = false'),
  ]) expect(() => installCodexInterruptHook(broken, configPath, { runtimeCommand: ["/new/runtime"] }, true)).toThrow("verifiable");
});
