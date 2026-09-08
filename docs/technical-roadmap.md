# Star Moon reverse-proxy roadmap

This roadmap keeps the existing MoonBook, ChatGPT Web browser, MCP setup, Zero Risk mode and reversible Codex route integration intact. New capabilities remain opt-in until they have real request evidence.

## Product boundary

- **Star Moon** remains the local desktop shell and the MoonBook journey.
- **群星** is the identity plane: isolated browser profiles, provider accounts, pool membership, health, quota snapshots and session leases.
- **虚假之天** is the capability plane: external reverse proxies, model catalogs, browser adapters, MCP bridges, images, search and transport evidence.
- No Multi-Agent feature is added. Multiple providers or accounts are represented as explicit routes and branches of one request, never as hidden model collaboration.

## Delivery stages

### Stage 0 — Baseline and visual state (complete/in progress)

- Preserve current MoonBook surfaces and route behavior.
- Keep browser state evidence separate from local health checks.
- Use one finite browser constellation animation for loading/testing/running, ready and error states.
- Keep reduced-motion behavior static and keep the preview clearly labeled.

### Stage 1 — 群星 core contracts (this implementation slice)

- Add pure, credential-free types for provider identities, browser identities, capability evidence and leases.
- Validate pool members before they can be selected.
- Select accounts by explicit affinity first, then health and deterministic order.
- Enforce one active lease per account/conversation and fail closed when the pool is empty.
- Persist only public pool metadata and opaque browser profile ids in an owner-only, versioned store; reject credential-shaped fields and never persist leases or browser storage.
- Derive each browser identity's private provider/profile directory from the opaque id, reject traversal/symlink roots, and create it with owner-only permissions; actual login remains a separate account evidence gate.
- Convert a page-owned ChatGPT/Claude composer observation into `health=unknown` and `capabilityEvidence=observed` metadata only; a visible composer never authorizes pool selection or claims a completed model turn.
- Upgrade browser identity metadata to `health=ready` and `capabilityEvidence=verified` only after a page-owned exact-marker turn completes over the browser DOM; this still does not claim that Star Moon's own adapter or Cockpit route handled that turn.
- Keep this module disconnected from production request routing until the adapter and persistence migration are reviewed.

### Stage 2 — Cockpit reverse proxy adapter (first slice implemented)

- Added an explicit optional `cockpit` configuration with loopback/HTTPS validation. It is absent and disabled by default, so existing routes do not change.
- Added an owner-only stored profile, generated Star Moon client key, CLI commands (`cockpit status/configure/probe/client-key/rollback/clear`) and a native Settings panel.
- Added namespaced `cockpit/<model>` rows to the local catalog when the authenticated Cockpit namespace requests them; native callers do not receive those rows accidentally.
- Added Chat Completions, Responses and `responses/compact` forwarding with `cockpit/<model>` stripped only at the Cockpit boundary.
- Added downstream client-key authorization, bounded model probing, redirect refusal, private key-file checks and hop-by-hop header filtering.
- Added an owner-only profile with atomic writes, generated Star Moon client-key storage, CLI operations, native IPC/preload wiring and a Settings panel. The runtime reloads the stored profile between requests, so configuration changes do not require replacing the existing ChatGPT route.
- Added private, bounded JSONL route evidence for probes, request acceptance, stream completion and cancellation; evidence contains only endpoint/model/status/timing/byte counts and a short sanitized error.
- Added an explicit evidence summary gate: `missing` means no request evidence, `observed` means only a successful model probe, `verified` requires a completed successful request, and `failed` records only failures/cancellations. Process liveness never advances this gate.
- Hardened the evidence gate so HTTP 200/EOF is insufficient: Responses requires a completed protocol event/body, Chat Completions requires a non-null finish reason, and image routes require a completed image result. Failed/incomplete/unrecognized SSE responses remain failed or unverified and cannot advance the gate.
- Cockpit requests now refuse redirects, strip cookies and connection-nominated headers, and reject models outside the configured/probed catalog before contacting the upstream.
- Added explicit `/v1/images/generations` and multipart `/v1/images/edits` forwarding for `cockpit/<model>` routes with the same client authorization and upstream key boundary; configured capability flags control whether image rows and requests are exposed.
- Added an atomic previous-profile backup and explicit `cockpit rollback`; rollback swaps the current and last-known-good profile without deleting the upstream key file.
- Added a bounded sidecar ownership contract (`src/cockpit-sidecar.ts`) that isolates HOME/XDG paths, fingerprints the command without exposing arguments, waits for an explicit readiness callback, and performs bounded SIGTERM/SIGKILL shutdown. It is tested independently and is not yet wired to a bundled AppImage until that sidecar's launch contract is verified.
- The isolated Cockpit v1.3.45 sidecar was launched with a private HOME and an empty account pool. Its `/v1/models` request returned `401` for both no-key and test-key requests; this is recorded as an authentication/account-pool gate, not as provider success.
- Remaining: WebSocket transport, a supervised bundled sidecar, and a real account-backed request matrix. The probe and HTTP request evidence now persist safely, but no evidence is treated as a successful model turn until a real account-backed matrix passes.
- Embedded Cockpit core is now represented inside Star Moon's own route contract: owner-only GPT/Claude account metadata, strict namespaces (`cockpit/gpt/*` and `cockpit/claude/*`), provider-matched account selection by priority plus conversation-key determinism, no cross-provider fallback, and route/provider/model evidence in the same narrative settings panel. This reuses the Cockpit routing boundary without copying Cockpit `auths/` or refresh tokens.
- A managed Codex Responses payload keeps its model, tools, `previous_response_id`, `reasoning` settings and streaming flag while the route namespace is stripped only at the upstream boundary. The focused contract test covers a multi-step GPT payload with a function tool and high reasoning effort; this proves payload preservation and routing, not a real account/model completion.

### Stage 3 — GPT browser pool

- Give each GPT Web identity a private Electron partition and profile directory.
- Add browser worker ownership, session affinity and cancellation by exact account/conversation/turn.
- Add a visual 群星 page whose nodes open the corresponding browser profile.
- Keep the existing single-profile browser mode as the default and migration fallback.

### Stage 4 — Claude API

- Add Anthropic Messages as a separate provider adapter.
- Map text, streaming, tool calls, images and structured failures into the existing event contract.
- Keep Claude API credentials outside browser profiles and outside Star Moon diagnostic exports.

### Stage 5 — Claude Web experiment

- Create a separate Claude Web worker and `CL-*` profile namespace.
- Prove login, composer, model selection, streaming, attachments, cancellation, reload and session retention separately.
- Keep the route hidden/experimental until those real account gates pass. A cookie/profile probe is not model-turn evidence.

### Stage 6 — MCP star gate

- Expose only allowlisted tools through a one-way broker.
- Bind every call to provider, account, thread, turn and one-time capability.
- Reject recursive Claude → Star Moon → Claude paths.
- Start with read-only status/model/quota tools before write operations.

#### External MCP bridge (implemented, opt-in)

Star Moon can now attach one explicitly configured external MCP server to the
Full/DEV stdio MCP server. The bridge performs OAuth resource-server discovery
without registering a client or sending credentials, requires HTTPS and S256
PKCE metadata, reads an owner-only bearer-token file, lists the external tools,
and exposes them under the `external__agentdock__*` wire namespace. Calls are
forwarded only when the exact namespaced tool was returned by `tools/list`;
freeform input is rejected and the external JSON-RPC result is normalized to
the local MCP response shape.

The endpoint is opt-in through `externalMcp` in the config or the equivalent
MCP command flags:

```json
{
  "externalMcp": {
    "endpoint": "https://mcp.example.invalid/mcp",
    "accessTokenFile": "/owner-only/path/mcp-access-token"
  }
}
```

Keep the token outside source archives and diagnostics. The current endpoint
evidence is limited to OAuth/PKCE discovery, MCP `initialize`, `tools/list`
(19 tools) and the read-only `agentdock_context` call. It does not prove that
ChatGPT has executed a Star Moon broker turn or that any write, shell, file,
or browser-control tool is safe to invoke.

## Non-negotiable invariants

- No credential copying between browser profiles or providers.
- No silent provider/account fallback.
- No claim of successful login, handshake, tool access or model response from health/port/process state alone.
- No account pool scheduler that changes an active conversation's identity.
- No raw cookies, tokens, prompt contents or generated manifests in diagnostics or source archives.
- Existing route journals, MoonBook, Zero Risk and native Codex restore behavior remain reversible.

## Acceptance evidence

Each stage needs a focused offline contract test first, followed by a real local request matrix. A green build, a healthy process, or a generated model catalog is not sufficient. The release gate must record provider, account, transport, request status, stream completion, cancellation, reload retention and rollback evidence separately.

Current evidence for this source package:

- 群星 pool/profile/web-login contracts: 14 focused tests pass; browser login observations remain `health=unknown` until a model turn is completed.
- Cockpit provider/profile contracts: 12 focused tests pass; loopback/HTTPS validation, client-key authorization, `/v1/models` parsing, Chat Completions, Responses, compact, image generation/edit forwarding, bounded evidence, atomic owner-only profile writes and rollback are covered.
- Root suite: 713/713 tests pass after the embedded GPT/Claude Cockpit route slice.
- Launcher suite: 446/446 tests pass; renderer typecheck and build pass.
- Real Cockpit account-backed request: **MISSING**. The isolated sidecar had no configured account, so no model response, SSE completion, image, WebSocket or session-affinity claim is made.
- Isolated Star Moon DEV adapter turn: **OBSERVED/COMPLETED**. The owned `persist:star-moon-dev-chatgpt` BrowserHost submitted a harmless exact-marker Luna turn and observed the response to completion; Codex route remained untouched. This proves the Star Moon browser adapter path, not MCP/local tools, long reasoning, or Cockpit API routing.
- DEV local-tool/MCP turn: **MISSING**. Browser-only mode correctly reports local tools unavailable; Full mode still requires a separately configured isolated MCP tunnel and connector.
- External AgentDock MCP endpoint: **OBSERVED**. OAuth dynamic registration with S256 PKCE completed in the isolated DEV workspace; `/mcp` initialize and `tools/list` returned HTTP 200, and the read-only `agentdock_context` tool returned structured content. No write/command/browser-control tool was called, and the OAuth token is not in the source archive. This proves the external MCP endpoint, not yet Star Moon broker routing.
- Current hardening slice: **FULL VERIFY PASS**. Cockpit provider/profile, embedded GPT/Claude account-pool routing, external MCP, and 群星 pool/lease tests pass after semantic completion evidence, redirect/cookie filtering, model allowlisting, owner-only profile checks, session-aware MCP notifications, and verified-capability selection were added; the final `bun run verify` passed with root 713/713, launcher 446/446, audits, renderer build, and relocatable runtime smoke.
