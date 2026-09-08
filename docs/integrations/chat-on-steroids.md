# Chat On Steroids integration

This document records how Project Star & Moon relates to the upstream
[Chat On Steroids](https://github.com/totec448-spec/chat-on-steroids) project. It is
part of the open-source release contract: a user must be able to tell which
capabilities are actually shipped, which are delegated to ChatGPT's connector,
and which still require an adapter.

## Audited upstream snapshot

- Repository: `totec448-spec/chat-on-steroids`
- License: MIT (see [`LICENSES/chat-on-steroids-MIT.txt`](../../LICENSES/chat-on-steroids-MIT.txt))
- Audited commit: `0f3ec7532b7d598275bf6ebf8f842495d8ab9284`
- Audited package version: `2.0.6`
- Companion artifact: `Chat-On-Steroids-Extension.zip`, versioned with the app

The upstream project provides a local MCP workbench, durable browser-session
recording, ordinary (non-temporary) ChatGPT conversations, Goal/Loop controls,
Compact & Resume, and reusable worker chats. These are valuable design inputs,
but the extension is not a drop-in library: it speaks a versioned loopback
bridge (`/hello`, `/pair`, `/status`, `/events`, `/activity`, command and input
routes) and expects its companion app to implement that complete protocol.

## What Star & Moon integrates now

Star & Moon keeps its existing browser-only and Full MCP routes as the source of
truth. The following compatible pieces are integrated and tested:

1. Every routed turn uses a normal persistent ChatGPT conversation. The browser
   guard rejects `?temporary-chat=true`, and retained conversation keys are
   reused across sequential turns and compaction handoff.
2. The first persistent turn carries an eager capability manifest. It enumerates
   every MCP/app/plugin tool supplied by the outer Responses request, preserves
   namespaces and tool kind, and tells the model to page through
   `codex_tool_inventory`/`tool_search` before doing task work. Hook lifecycle
   ownership remains with the outer Codex runtime; hook commands and credentials
   are never copied into a prompt.
3. Responses Lite accepts both the input-item and top-level `additional_tools`
   spellings, so deferred MCP/app tools are not silently lost before the first
   turn.
4. The launcher package exposes a pinned, user-visible download link for the
   upstream browser companion. A user can install the matching extension in a
   normal Chrome/Chromium profile without using a private/temporary ChatGPT
   conversation.

The existing Native2/AgentDock connectors still provide the actual Codex file,
shell, image, approval, and configured MCP/app operations. Installing a browser
extension does not widen those permissions or bypass the connector's approval
checks.

## Deliberate boundary: no unadapted extension copy

The upstream extension is not copied into the Star & Moon bundle yet. Its bridge
protocol and lifecycle/session store are materially different from Star & Moon's
launcher control server and turn broker. Copying `extension/` without the
matching bridge would produce a green-looking installation that cannot reliably
record, resume, or route a conversation—the exact failure mode this project is
trying to remove.

The next adapter milestone is explicit and testable:

- implement a Star & Moon companion bridge with origin, bearer, protocol, and
  exactly-once event/command semantics;
- map the extension's durable session journal to Star & Moon's retained
  conversation store;
- add an opt-in compatibility surface for Goal/Loop, Compact & Resume, and
  worker chats; and
- run the browser matrix with a normal Chrome profile, reloads, closed tabs,
  and app restarts before advertising those features as supported.

Until that milestone passes, the launcher must label the downloaded companion as
an optional upstream integration and must not claim that upstream Goal/Loop or
multi-agent controls are available through Star & Moon.

## Install flow for maintainers and testers

1. Finish the Star & Moon setup and verify the Native2/AgentDock connector.
2. Open the pinned **Chat On Steroids companion** download from the launcher.
3. Unzip it, open `chrome://extensions`, enable Developer mode, choose **Load
   unpacked**, and select the extracted extension directory.
4. Keep the normal ChatGPT conversation open and confirm that the extension's
   own status page reports the matching app/protocol. If it reports a protocol
   mismatch or “app not found”, remove the extension from the test profile and
   return to the launcher; do not retry by switching to a private chat.

This is a local browser integration. Do not publish pairing tokens, tunnel URLs,
cookies, API keys, or raw session journals in issues or screenshots.
