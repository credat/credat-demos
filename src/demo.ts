import { createAgent, createDidWeb, delegate, generateKeyPair } from "@credat/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { runLlmAgent, runScriptedAgent } from "./agent.js";
import { buildEmailServer } from "./email-server.js";
import * as narrate from "./narrate.js";

async function main(): Promise<void> {
	narrate.title("Credat demo — scoped email access for an AI agent");
	narrate.rule();

	// ── 1. Owner delegates scoped permissions to the agent ──
	narrate.section("1. Owner delegates scoped permissions");

	const ownerKeyPair = generateKeyPair("ES256");
	const ownerDid = createDidWeb("acme.example");
	narrate.step(`Owner identity:  ${ownerDid}`);

	const agent = await createAgent({
		domain: "agents.acme.example",
		path: "email-assistant",
	});
	narrate.step(`Agent identity:  ${agent.did}`);

	const delegation = await delegate({
		agent: agent.did,
		owner: ownerDid,
		ownerKeyPair,
		scopes: ["email:read"],
		validUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
	});
	narrate.note("Owner granted exactly one scope: email:read  —  NOT email:send");
	narrate.blank();

	// ── 2. The email service: an MCP server protected by Credat ──
	narrate.section("2. The email service (an MCP server protected by Credat)");

	const server = buildEmailServer({
		ownerPublicKey: ownerKeyPair.publicKey,
		agentPublicKey: agent.keyPair.publicKey,
	});
	narrate.step("Tool read-emails  →  requires scope email:read");
	narrate.step("Tool send-email   →  requires scope email:send");
	narrate.blank();

	// ── 3. Connect agent and server over an in-memory MCP transport ──
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const client = new Client({ name: "credat-demo-agent", version: "0.0.0" });
	await server.connect(serverTransport);
	await client.connect(clientTransport);

	// ── 4. Run the agent ──
	const useLlm = Boolean(process.env.ANTHROPIC_API_KEY);
	narrate.section(
		useLlm
			? "3. The agent runs (LLM mode — driven by Claude)"
			: "3. The agent runs (scripted mode — set ANTHROPIC_API_KEY for LLM mode)",
	);

	const runOptions = { client, agent, delegation: delegation.token };
	if (useLlm) {
		await runLlmAgent(runOptions);
	} else {
		await runScriptedAgent(runOptions);
	}

	// ── 5. Summary ──
	narrate.blank();
	narrate.rule();
	narrate.section("What just happened");
	narrate.detail("• The agent proved its identity with a cryptographic handshake.");
	narrate.detail("• The owner's delegation granted only email:read.");
	narrate.detail("• The server enforced scopes — read was allowed, send was denied.");
	narrate.detail("• No shared secret or API key was handed to the agent — just scoped trust.");
	narrate.blank();

	await client.close();
	await server.close();
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
