# credat-demos

Runnable, end-to-end demos for [Credat](https://github.com/credat) — the trust layer for AI agents.

## Scoped email access

The flagship demo shows the whole Credat wedge working together in one process:

| Package | Role in the demo |
|---|---|
| [`@credat/sdk`](https://www.npmjs.com/package/@credat/sdk) | An owner creates an agent identity and delegates it a scoped credential |
| [`@credat/mcp`](https://www.npmjs.com/package/@credat/mcp) | An email service, exposed as an MCP server, verifies the agent and enforces scopes |
| [`@credat/langchain`](https://www.npmjs.com/package/@credat/langchain) | The agent authenticates using the LangChain toolkit |

**The scenario:** an owner delegates an email-assistant agent the `email:read` scope — and deliberately *not* `email:send`. The agent authenticates to the email service, reads the inbox fine, and is **rejected** when it tries to send. Identity proven, delegation scoped, enforcement demonstrated.

## Run it

```bash
npm install
npm run demo
```

No configuration, no API keys, no network calls.

```
1. Owner delegates scoped permissions
  → Owner identity:  did:web:acme.example
  → Agent identity:  did:web:agents.acme.example:email-assistant
  • Owner granted exactly one scope: email:read  —  NOT email:send

2. The email service (an MCP server protected by Credat)
  → Tool read-emails  →  requires scope email:read
  → Tool send-email   →  requires scope email:send

3. The agent runs
  → Agent authenticates with the email service (3-message handshake)...
  ✓ Authenticated — server granted scopes: email:read
  → Agent calls read-emails (requires email:read)...
  ✓ read-emails allowed — 3 messages in the inbox
  → Agent calls send-email (requires email:send)...
  ✗ send-email rejected — Insufficient scopes. Missing: email:send
```

## How it works

The demo runs a **real MCP server** (`@credat/mcp` on top of `@modelcontextprotocol/sdk`) and a **real MCP client**, connected by the MCP SDK's in-memory transport — so it runs in a single process with no ports, but exercises the genuine protocol and the published packages.

The agent side uses `@credat/langchain`'s `CredatToolkit`. `@credat/langchain` ships an `HttpTransport`; this demo includes a small **MCP transport bridge** ([`src/mcp-transport.ts`](src/mcp-transport.ts)) — the equivalent for services exposed over the Model Context Protocol.

```
LangChain agent ──► CredatToolkit ──► MCP transport bridge ──► MCP client
                                                                   │
                                              in-memory transport  │
                                                                   ▼
                              MCP server (read-emails, send-email) ◄── @credat/mcp
```

| File | Purpose |
|---|---|
| `src/demo.ts` | Entry point — orchestrates and narrates the story |
| `src/email-server.ts` | The email service: an MCP server protected by `@credat/mcp` |
| `src/mcp-transport.ts` | Bridges `@credat/langchain`'s transport interface to an MCP client |
| `src/agent.ts` | The agent — scripted flow and optional LLM flow |
| `src/narrate.ts` | Console output helpers |

## LLM mode (optional)

By default the demo runs a deterministic scripted flow. Set an Anthropic API key and it runs a **real LangChain agent loop** — the model decides to authenticate, read, and send, and hits the same scope wall on its own:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run demo
```

## License

Apache-2.0
