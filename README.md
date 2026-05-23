# credat-demos

Runnable, end-to-end demos for [Credat](https://github.com/credat) — the trust layer for AI agents.

Each demo dramatizes the same scenario — **scoped email access** — across a different transport, so you can see how Credat behaves in the environments where agents actually meet services.

## The scenario

An owner delegates an email-assistant agent the `email:read` scope — and deliberately **not** `email:send`. The agent authenticates to an email service, reads the inbox fine, and is **rejected** when it tries to send.

Identity proven, delegation scoped, enforcement demonstrated.

## The two demos

| Script | Story |
|---|---|
| [`npm run demo`](src/demo.ts) | Agent ↔ **MCP server**. Uses [`@credat/sdk`](https://www.npmjs.com/package/@credat/sdk) + [`@credat/mcp`](https://www.npmjs.com/package/@credat/mcp) + [`@credat/langchain`](https://www.npmjs.com/package/@credat/langchain). Single process, in-memory MCP transport. |
| [`npm run demo:http`](src/http-demo.ts) | Agent ↔ **plain HTTP API** (Express). Uses [`@credat/sdk`](https://www.npmjs.com/package/@credat/sdk) + [`@credat/http`](https://www.npmjs.com/package/@credat/http). Real HTTP server on a local port, bearer-token sessions. |

Both are zero-config — `npm install && npm run demo:*`. No API keys, no external services.

## What each demo runs

### `npm run demo` — MCP transport

```
1. Owner delegates scoped permissions  (email:read only)
2. Email MCP server — read-emails (needs email:read), send-email (needs email:send)
3. Agent authenticates via the 3-message handshake
   ✓ Authenticated — server granted scopes: email:read
   ✓ read-emails allowed — 3 messages in the inbox
   ✗ send-email rejected — Insufficient scopes. Missing: email:send
```

A real `McpServer` (`@credat/mcp` on top of `@modelcontextprotocol/sdk`) and a real MCP `Client` connected by the SDK's in-memory transport. The agent side uses `@credat/langchain`'s `CredatToolkit` with a small MCP transport bridge ([`src/mcp-transport.ts`](src/mcp-transport.ts)).

### `npm run demo:http` — HTTP transport

```
2. Email service (Express + @credat/http)
   → Service listening on http://127.0.0.1:53210
   → POST /credat/challenge      →  issue handshake nonce
   → POST /credat/authenticate   →  exchange presentation for session
   → GET  /emails                →  requires scope email:read
   → POST /emails/send           →  requires scope email:send
3. Agent authenticates over HTTP
   ✓ Session established — granted scopes: email:read
4. Agent makes scoped requests
   ✓ 200 OK — 3 messages
   ✗ 403 INSUFFICIENT_SCOPES — Missing: email:send
```

A real Express app protected by `@credat/http`. The agent runs the handshake over `fetch`, gets a bearer session token, and calls the protected routes. Same scopes, same outcome — over the wire that most production services actually use.

## LLM mode (MCP demo only)

By default the MCP demo runs a deterministic scripted flow. Set an Anthropic API key and it runs a **real LangChain agent loop** — the model decides to authenticate, read, and send, and hits the same scope wall on its own:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run demo
```

## Files

```
src/
  demo.ts            # MCP demo entry
  http-demo.ts       # HTTP demo entry
  email-server.ts    # MCP server: @credat/mcp + read-emails / send-email
  mcp-transport.ts   # Bridge: @credat/langchain ITransport ↔ MCP client
  agent.ts           # CredatToolkit + scripted flow + optional LLM mode
  narrate.ts         # console formatting helpers
```

## License

Apache-2.0
