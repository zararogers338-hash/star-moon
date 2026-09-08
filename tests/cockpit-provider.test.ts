import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defaultConfig } from "../src/config";
import {
  cockpitModelCatalogRows,
  cockpitImagesRequest,
  cockpitImagesEditRequest,
  cockpitChatCompletionsRequest,
  forwardCockpitRequest,
  isCockpitModelSlug,
  resolveCockpitTarget,
  validateCockpitConfig,
} from "../src/cockpit-provider";
import { readCockpitEvidence, summarizeCockpitEvidence } from "../src/cockpit-evidence";
import { modelsRequest, responseRequest } from "../src/server";

function config() {
  const value = defaultConfig("browser-only");
  value.cockpit = {
    enabled: true,
    baseUrl: "http://127.0.0.1:4317/v1",
    apiKey: "cockpit-local-key",
    clientApiKey: "star-moon-client-key",
    models: ["gpt-5.6-sol", "any/claude-opus", "gpt-image-1"],
  };
  return value;
}

const temporaryRoots: string[] = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Cockpit reverse-proxy provider", () => {
  test("accepts only explicit Cockpit model slugs", () => {
    expect(isCockpitModelSlug("cockpit/gpt-5.6-sol")).toBe(true);
    expect(isCockpitModelSlug("gpt-5.6-sol")).toBe(false);
    expect(() => validateCockpitConfig({
      enabled: true, baseUrl: "https://example.test/v1", apiKey: "12345678", models: ["gpt"],
    })).not.toThrow();
    expect(() => validateCockpitConfig({
      enabled: true, baseUrl: "http://192.168.1.3:4317/v1", apiKey: "12345678", models: ["gpt"],
    })).toThrow("HTTPS or a loopback HTTP");
  });

  test("publishes configured Cockpit models with an explicit namespace", () => {
    expect(cockpitModelCatalogRows(config()).map(model => model.slug)).toEqual([
      "cockpit/gpt-5.6-sol", "cockpit/any/claude-opus", "cockpit/gpt-image-1",
    ]);
  });

  test("routes embedded GPT and Claude namespaces through the matching account pool", async () => {
    const root = mkdtempSync(join(tmpdir(), "star-moon-cockpit-routes-"));
    temporaryRoots.push(root);
    const gptKey = join(root, "gpt-key");
    const claudeKey = join(root, "claude-key");
    writeFileSync(gptKey, "gpt-secret-key\n", { mode: 0o600 });
    writeFileSync(claudeKey, "claude-secret-key\n", { mode: 0o600 });
    chmodSync(gptKey, 0o600); chmodSync(claudeKey, 0o600);
    const configured = validateCockpitConfig({
      ...config().cockpit!,
      accounts: [
        { id: "gpt-account", label: "GPT", provider: "gpt", enabled: true, health: "ready", priority: 0, baseUrl: "http://127.0.0.1:4317/v1", apiKeyFile: gptKey, models: ["gpt-5.6-sol"] },
        { id: "claude-account", label: "Claude", provider: "claude", enabled: true, health: "ready", priority: 0, baseUrl: "http://127.0.0.1:4318/v1", apiKeyFile: claudeKey, models: ["claude-opus"] },
      ],
      routes: [
        { id: "gpt-route", namespace: "gpt", provider: "gpt", accountIds: ["gpt-account"], models: ["gpt-5.6-sol"], strict: true },
        { id: "claude-route", namespace: "claude", provider: "claude", accountIds: ["claude-account"], models: ["claude-opus"], strict: true },
      ],
    });
    const gpt = resolveCockpitTarget(configured, "cockpit/gpt/gpt-5.6-sol", "thread-1");
    const claude = resolveCockpitTarget(configured, "cockpit/claude/claude-opus", "thread-1");
    expect(gpt).toMatchObject({ provider: "gpt", routeId: "gpt-route", accountId: "gpt-account", baseUrl: "http://127.0.0.1:4317/v1", upstreamModel: "gpt-5.6-sol" });
    expect(claude).toMatchObject({ provider: "claude", routeId: "claude-route", accountId: "claude-account", baseUrl: "http://127.0.0.1:4318/v1", upstreamModel: "claude-opus" });
    expect(gpt.apiKey).toBe("gpt-secret-key");
    expect(claude.apiKey).toBe("claude-secret-key");
    let observed: Request | undefined;
    const response = await forwardCockpitRequest(
      new Request("http://127.0.0.1/v1/responses", { method: "POST", headers: { authorization: "Bearer star-moon-client-key", "x-codex-thread-id": "thread-1" }, body: "{}" }),
      "responses",
      { ...config(), cockpit: configured },
      { model: "cockpit/claude/claude-opus", input: [] },
      async request => { observed = request; return Response.json({ status: "completed", output: [] }); },
    );
    expect(response.status).toBe(200);
    expect(observed?.url).toBe("http://127.0.0.1:4318/v1/responses");
    expect(observed?.headers.get("authorization")).toBe("Bearer claude-secret-key");
    expect(await observed?.json()).toMatchObject({ model: "claude-opus" });
  });

  test("preserves a managed Codex multi-step Responses payload across the GPT route", async () => {
    const root = mkdtempSync(join(tmpdir(), "star-moon-cockpit-reasoning-"));
    temporaryRoots.push(root);
    const keyFile = join(root, "gpt-key");
    writeFileSync(keyFile, "gpt-secret-key\n", { mode: 0o600 });
    chmodSync(keyFile, 0o600);
    const routed = validateCockpitConfig({
      ...config().cockpit!,
      accounts: [{ id: "gpt-account", label: "GPT", provider: "gpt", enabled: true, health: "ready", priority: 0, baseUrl: "http://127.0.0.1:4319/v1", apiKeyFile: keyFile, models: ["gpt-5.6-sol"] }],
      routes: [{ id: "gpt-route", namespace: "gpt", provider: "gpt", accountIds: ["gpt-account"], models: ["gpt-5.6-sol"], strict: true }],
    });
    let observedBody: Record<string, unknown> | undefined;
    const response = await forwardCockpitRequest(
      new Request("http://127.0.0.1/v1/responses", { method: "POST", headers: { "x-codex-thread-id": "thread-multi-step" }, body: "{}" }),
      "responses",
      { ...config(), cockpit: routed },
      {
        model: "cockpit/gpt/gpt-5.6-sol",
        stream: true,
        reasoning: { effort: "high" },
        previous_response_id: "resp_previous",
        input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "continue" }] }],
        tools: [{ type: "function", name: "lookup", parameters: { type: "object" } }],
      },
      async request => {
        observedBody = await request.json() as Record<string, unknown>;
        return new Response('event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n', { status: 200, headers: { "content-type": "text/event-stream" } });
      },
    );
    expect(response.status).toBe(200);
    expect(observedBody).toMatchObject({ model: "gpt-5.6-sol", stream: true, previous_response_id: "resp_previous", reasoning: { effort: "high" } });
    expect(observedBody?.tools).toEqual([{ type: "function", name: "lookup", parameters: { type: "object" } }]);
  });

  test("rejects a Cockpit model outside the configured catalog before contacting the upstream", async () => {
    let called = false;
    await expect(forwardCockpitRequest(
      new Request("http://127.0.0.1/v1/responses", { method: "POST", body: "{}" }),
      "responses",
      config(),
      { model: "cockpit/not-configured", input: [] },
      async () => { called = true; return new Response("should not be called", { status: 200 }); },
    )).rejects.toThrow("not in the configured catalog");
    expect(called).toBe(false);
  });

  test("forwards one Responses request with the upstream model and generated auth", async () => {
    let observed: Request | undefined;
    const response = await forwardCockpitRequest(
      new Request("http://127.0.0.1/v1/responses", { method: "POST", body: "{}" }),
      "responses",
      config(),
      { model: "cockpit/any/claude-opus", input: [{ role: "user", content: "hello" }] },
      async request => {
        observed = request;
        return new Response('event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n', { status: 200, headers: { "content-type": "text/event-stream" } });
      },
    );
    expect(response.status).toBe(200);
    expect(observed?.url).toBe("http://127.0.0.1:4317/v1/responses");
    expect(observed?.headers.get("authorization")).toBe("Bearer cockpit-local-key");
    expect(await observed?.json()).toMatchObject({ model: "any/claude-opus" });
  });

  test("intercepts a Cockpit model before native Codex passthrough", async () => {
    const response = await responseRequest(
      new Request("http://127.0.0.1/v1/responses", {
        method: "POST",
        headers: { authorization: "Bearer star-moon-client-key" },
        body: JSON.stringify({ model: "cockpit/gpt-5.6-sol", input: [{ role: "user", content: "hello" }], stream: false }),
      }),
      config(),
      undefined,
      undefined,
    );
    // No configured Cockpit listener means this must fail as an upstream error, rather than
    // asking the official Codex endpoint for a model it does not own.
    expect(response.status).toBe(502);
  });

  test("adds Cockpit rows after native rows without changing the native catalog", async () => {
    const source = { data: [{ id: "gpt-5.6-sol" }, { id: "any/claude-opus" }] };
    const response = await modelsRequest(
      new Request("http://127.0.0.1/v1/models", { headers: { authorization: "Bearer star-moon-client-key" } }),
      config(),
      async () => new Response(JSON.stringify(source), { status: 200, headers: { "content-type": "application/json" } }),
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<{ slug: string }> };
    expect(body.data.some(model => model.slug === "cockpit/gpt-5.6-sol")).toBe(true);
  });

  test("records redacted request evidence after a streamed body is consumed", async () => {
    const root = mkdtempSync(join(tmpdir(), "star-moon-cockpit-evidence-"));
    temporaryRoots.push(root);
    const configured = { ...config(), cockpit: { ...config().cockpit!, evidencePath: join(root, "evidence.jsonl") } };
    const response = await forwardCockpitRequest(
      new Request("http://127.0.0.1/v1/responses", { method: "POST", body: "{}" }),
      "responses",
      configured,
      { model: "cockpit/gpt-5.6-sol", input: [{ role: "user", content: "private prompt text" }] },
      async () => new Response('event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n', { status: 200, headers: { "content-type": "text/event-stream" } }),
    );
    await response.text();
    const records = readCockpitEvidence(configured.cockpit.evidencePath);
    expect(records.map(record => record.outcome)).toEqual(["accepted", "completed"]);
    expect(records[1]?.protocol).toBe("completed");
    expect(JSON.stringify(records)).not.toContain("private prompt text");
    expect(JSON.stringify(records)).not.toContain("cockpit-local-key");
    expect(summarizeCockpitEvidence(records)).toMatchObject({ gate: "verified", completedRequests: 1, requests: 2 });
  });

  test("does not treat an HTTP 200 failed SSE event as a verified model request", async () => {
    const root = mkdtempSync(join(tmpdir(), "star-moon-cockpit-failed-evidence-"));
    temporaryRoots.push(root);
    const configured = { ...config(), cockpit: { ...config().cockpit!, evidencePath: join(root, "evidence.jsonl") } };
    const response = await forwardCockpitRequest(
      new Request("http://127.0.0.1/v1/responses", { method: "POST", body: "{}" }),
      "responses",
      configured,
      { model: "cockpit/gpt-5.6-sol", input: [] },
      async () => new Response('data: {"type":"response.failed","response":{"status":"failed"}}\n\n', { status: 200, headers: { "content-type": "text/event-stream" } }),
    );
    expect(response.status).toBe(200);
    await response.text();
    const records = readCockpitEvidence(configured.cockpit.evidencePath);
    expect(records.at(-1)).toMatchObject({ outcome: "failed", protocol: "failed", ok: false });
    expect(summarizeCockpitEvidence(records).gate).toBe("failed");
  });

  test("refuses upstream redirects and does not forward cookies or connection-nominated headers", async () => {
    let observed: Request | undefined;
    await expect(forwardCockpitRequest(
      new Request("http://127.0.0.1/v1/responses", {
        method: "POST",
        headers: { cookie: "chatgpt-secret", connection: "x-private", "x-private": "should-not-forward" },
        body: "{}",
      }),
      "responses",
      config(),
      { model: "cockpit/gpt-5.6-sol", input: [] },
      async request => {
        observed = request;
        expect(request.redirect).toBe("manual");
        return new Response("", { status: 307, headers: { location: "https://untrusted.example/" } });
      },
    )).rejects.toThrow("redirect was refused");
    expect(observed?.headers.get("cookie")).toBeNull();
    expect(observed?.headers.get("x-private")).toBeNull();
  });

  test("forwards explicit Cockpit image generation requests without native fallback", async () => {
    let observed: Request | undefined;
    const response = await cockpitImagesRequest(
      new Request("http://127.0.0.1/v1/images/generations", {
        method: "POST",
        headers: { authorization: "Bearer star-moon-client-key" },
        body: JSON.stringify({ model: "cockpit/gpt-image-1", prompt: "a moon" }),
      }),
      config(),
      async request => {
        observed = request;
        return Response.json({ created: 1_800_000_000, data: [{ b64_json: "test" }] });
      },
    );
    expect(response.status).toBe(200);
    expect(observed?.url).toBe("http://127.0.0.1:4317/v1/images/generations");
    expect(observed?.headers.get("authorization")).toBe("Bearer cockpit-local-key");
    expect(await observed?.json()).toMatchObject({ model: "gpt-image-1", prompt: "a moon" });
  });

  test("does not advertise or forward an explicitly disabled image capability", async () => {
    const disabled = { ...config(), cockpit: { ...config().cockpit!, capabilities: { images: false } } };
    expect(cockpitModelCatalogRows(disabled)[0]?.input_modalities).toEqual(["text"]);
    const response = await cockpitImagesRequest(
      new Request("http://127.0.0.1/v1/images/generations", {
        method: "POST",
        headers: { authorization: "Bearer star-moon-client-key" },
        body: JSON.stringify({ model: "cockpit/gpt-image-1", prompt: "a moon" }),
      }),
      disabled,
      async () => new Response("should not be called", { status: 200 }),
    );
    expect(response.status).toBe(503);
  });

  test("forwards Chat Completions through the same explicit namespace", async () => {
    let observed: Request | undefined;
    const response = await cockpitChatCompletionsRequest(
      new Request("http://127.0.0.1/v1/chat/completions", {
        method: "POST",
        headers: { authorization: "Bearer star-moon-client-key" },
        body: JSON.stringify({ model: "cockpit/gpt-5.6-sol", messages: [{ role: "user", content: "hello" }] }),
      }),
      config(),
      async request => {
        observed = request;
        return Response.json({ id: "chatcmpl_test", choices: [{ message: { role: "assistant", content: "ok" } }] });
      },
    );
    expect(response.status).toBe(200);
    expect(observed?.url).toBe("http://127.0.0.1:4317/v1/chat/completions");
    expect(await observed?.json()).toMatchObject({ model: "gpt-5.6-sol" });
  });

  test("rewrites only the model field in a multipart image edit", async () => {
    let observed: Request | undefined;
    const form = new FormData();
    form.set("model", "cockpit/gpt-image-1");
    form.set("prompt", "edit this");
    form.set("image", new File(["image-bytes"], "input.png", { type: "image/png" }));
    const response = await cockpitImagesEditRequest(
      new Request("http://127.0.0.1/v1/images/edits", {
        method: "POST",
        headers: { authorization: "Bearer star-moon-client-key" },
        body: form,
      }),
      config(),
      async request => {
        observed = request;
        return Response.json({ data: [{ url: "https://example.test/image" }] });
      },
    );
    expect(response.status).toBe(200);
    const forwarded = await observed?.formData();
    expect(forwarded?.get("model")).toBe("gpt-image-1");
    expect(forwarded?.get("prompt")).toBe("edit this");
    expect((forwarded?.get("image") as File)?.name).toBe("input.png");
  });
});
