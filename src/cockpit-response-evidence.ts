import type { CockpitEndpoint } from "./cockpit-provider";

export type CockpitProtocolOutcome = "completed" | "failed" | "incomplete" | "unverified";

const MAX_INSPECT_BYTES = 2 * 1024 * 1024;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function responseStatus(value: unknown): string | undefined {
  return isObject(value) && typeof value.status === "string" ? value.status : undefined;
}

function resultFromJson(endpoint: CockpitEndpoint, value: unknown): CockpitProtocolOutcome | undefined {
  if (!isObject(value)) return undefined;
  if (isObject(value.error)) return "failed";
  if (endpoint === "responses" || endpoint === "responses/compact") {
    const status = responseStatus(value);
    if (status === "completed") return "completed";
    if (status === "failed" || status === "cancelled") return "failed";
    if (status === "incomplete") return "incomplete";
    // Some compact providers wrap a completed response under `response`.
    if (isObject(value.response)) return resultFromJson(endpoint, value.response);
    return undefined;
  }
  if (endpoint === "chat/completions") {
    if (!Array.isArray(value.choices)) return undefined;
    return value.choices.some(choice => isObject(choice) && choice.finish_reason !== null && choice.finish_reason !== undefined)
      ? "completed"
      : undefined;
  }
  if (endpoint === "images/generations" || endpoint === "images/edits") {
    return Array.isArray(value.data) && value.data.length > 0 ? "completed" : undefined;
  }
  return undefined;
}

function resultFromSse(endpoint: CockpitEndpoint, value: unknown): CockpitProtocolOutcome | undefined {
  if (!isObject(value)) return undefined;
  const type = typeof value.type === "string" ? value.type : "";
  if (type === "error" || type.endsWith(".failed") || type === "response.failed" || type === "response.error") return "failed";
  if (type === "response.incomplete") return "incomplete";
  if (type === "response.completed") {
    return responseStatus(value.response) === "completed" ? "completed" : "failed";
  }
  if (endpoint === "chat/completions" && Array.isArray(value.choices)) {
    return value.choices.some(choice => isObject(choice) && choice.finish_reason !== null && choice.finish_reason !== undefined)
      ? "completed"
      : undefined;
  }
  if ((endpoint === "images/generations" && type === "image_generation.completed")
    || (endpoint === "images/edits" && type === "image_edit.completed")) {
    return typeof value.b64_json === "string" && value.b64_json.length > 0 ? "completed" : "failed";
  }
  return undefined;
}

/**
 * Inspect a bounded copy of a provider response while forwarding the original stream.
 * This is deliberately stricter than HTTP success: a request is verified only after a
 * protocol-defined completion event or response body is observed.
 */
export function createCockpitResponseInspector(endpoint: CockpitEndpoint, headers: Headers): {
  push(chunk: Uint8Array): void;
  finish(status: number): { protocol: CockpitProtocolOutcome; detail?: string };
} {
  const contentType = headers.get("content-type")?.toLowerCase() ?? "";
  const isSse = contentType.includes("text/event-stream");
  const decoder = new TextDecoder();
  let pending = "";
  let buffered = "";
  let bytes = 0;
  let overflow = false;
  let observed: CockpitProtocolOutcome | undefined;

  const observe = (outcome: CockpitProtocolOutcome | undefined): void => {
    if (outcome === undefined) return;
    if (outcome === "failed" || outcome === "incomplete") {
      observed = outcome;
      return;
    }
    if (observed === undefined) observed = outcome;
  };
  const parseSseLine = (line: string): void => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try { observe(resultFromSse(endpoint, JSON.parse(data))); } catch { /* keep inspecting subsequent events */ }
  };
  return {
    push(chunk) {
      bytes += chunk.byteLength;
      if (bytes > MAX_INSPECT_BYTES) {
        overflow = true;
        return;
      }
      const text = decoder.decode(chunk, { stream: true });
      if (isSse) {
        pending += text;
        let newline = pending.indexOf("\n");
        while (newline >= 0) {
          parseSseLine(pending.slice(0, newline).replace(/\r$/, ""));
          pending = pending.slice(newline + 1);
          newline = pending.indexOf("\n");
        }
      } else {
        buffered += text;
      }
    },
    finish(status) {
      if (status < 200 || status >= 300) return { protocol: "failed", detail: "Cockpit upstream returned a non-success HTTP status" };
      if (overflow) return { protocol: "unverified", detail: "Cockpit response exceeded the bounded semantic inspection limit" };
      if (isSse) {
        parseSseLine(pending.replace(/\r$/, ""));
        if (observed === "completed") return { protocol: "completed" };
        if (observed === "failed") return { protocol: "failed", detail: "Cockpit provider reported a failed response event" };
        if (observed === "incomplete") return { protocol: "incomplete", detail: "Cockpit provider reported an incomplete response event" };
        return { protocol: "unverified", detail: "Cockpit SSE ended without a recognized completion event" };
      }
      try {
        const result = resultFromJson(endpoint, JSON.parse(buffered));
        if (result) return { protocol: result, ...(result === "completed" ? {} : { detail: "Cockpit provider did not report a completed response" }) };
      } catch { /* handled as unverified below */ }
      return { protocol: "unverified", detail: "Cockpit body did not contain a recognized completed response" };
    },
  };
}
