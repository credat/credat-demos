import { CredatToolkit } from "@credat/langchain";
import type { AgentIdentity } from "@credat/sdk";
import type { BaseMessageLike } from "@langchain/core/messages";
import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { tool } from "@langchain/core/tools";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createMcpTransport } from "./mcp-transport.js";
import * as narrate from "./narrate.js";

export interface AgentRunOptions {
	client: Client;
	agent: AgentIdentity;
	delegation: string;
}

const SERVICE = { id: "acme-email", name: "Acme Email" };

function firstText(result: CallToolResult): string {
	const block = result.content.find((b) => b.type === "text");
	return block && block.type === "text" ? block.text : "";
}

function callTool(
	client: Client,
	name: string,
	args: Record<string, unknown> = {},
): Promise<CallToolResult> {
	return client.callTool({ name, arguments: args }) as Promise<CallToolResult>;
}

/**
 * Deterministic flow — no LLM, no API key. This is what runs by default.
 */
export async function runScriptedAgent(options: AgentRunOptions): Promise<void> {
	const { client, agent, delegation } = options;

	const toolkit = new CredatToolkit({
		agent,
		delegation,
		transport: createMcpTransport(client),
		service: SERVICE,
	});

	const authTool = toolkit.getTools().find((t) => t.name === "credat_authenticate");
	if (!authTool) {
		throw new Error("credat_authenticate tool not found in toolkit");
	}

	narrate.step("Agent authenticates with the email service (3-message handshake)...");
	const authRaw = (await authTool.invoke({})) as string;
	const auth = JSON.parse(authRaw) as { status: string; scopes?: string[]; error?: string };

	if (auth.status !== "authenticated" && auth.status !== "already_authenticated") {
		narrate.deny(`Handshake failed: ${auth.error ?? authRaw}`);
		return;
	}
	narrate.allow(`Authenticated — server granted scopes: ${(auth.scopes ?? []).join(", ")}`);
	narrate.blank();

	narrate.step("Agent calls read-emails (requires email:read)...");
	const read = await callTool(client, "read-emails");
	if (read.isError) {
		narrate.deny(`read-emails rejected unexpectedly: ${firstText(read)}`);
	} else {
		const inbox = JSON.parse(firstText(read)) as Array<{ from: string; subject: string }>;
		narrate.allow(`read-emails allowed — ${inbox.length} messages in the inbox:`);
		for (const mail of inbox) {
			narrate.detail(`"${mail.subject}"  ·  ${mail.from}`);
		}
	}
	narrate.blank();

	narrate.step("Agent calls send-email (requires email:send)...");
	const sent = await callTool(client, "send-email", {
		to: "all-contacts@acme.example",
		subject: "FW: Invoice #4471",
		body: "Forwarding this along.",
	});
	if (sent.isError) {
		const err = JSON.parse(firstText(sent)) as { error?: string; details?: string[] };
		narrate.deny(`send-email rejected — ${err.error ?? "access denied"}`);
		for (const line of err.details ?? []) {
			narrate.detail(line);
		}
	} else {
		narrate.deny("send-email succeeded — UNEXPECTED: the agent was never granted email:send");
	}
}

/**
 * LLM-driven flow — a real LangChain agent loop deciding which tools to call.
 * Runs only when ANTHROPIC_API_KEY is set.
 */
export async function runLlmAgent(options: AgentRunOptions): Promise<void> {
	const { client, agent, delegation } = options;
	const { ChatAnthropic } = await import("@langchain/anthropic");

	const toolkit = new CredatToolkit({
		agent,
		delegation,
		transport: createMcpTransport(client),
		service: SERVICE,
	});

	const readEmails = tool(async () => firstText(await callTool(client, "read-emails")), {
		name: "read_emails",
		description: "Read the most recent emails in the inbox.",
		schema: z.object({}),
	});

	const sendEmail = tool(
		async (input: { to: string; subject: string; body: string }) =>
			firstText(await callTool(client, "send-email", input)),
		{
			name: "send_email",
			description: "Send an email on the owner's behalf.",
			schema: z.object({
				to: z.string(),
				subject: z.string(),
				body: z.string(),
			}),
		},
	);

	const tools: StructuredToolInterface[] = [...toolkit.getTools(), readEmails, sendEmail];
	const toolsByName = new Map(tools.map((t) => [t.name, t]));

	const model = new ChatAnthropic({
		model: "claude-haiku-4-5-20251001",
		temperature: 0,
	}).bindTools(tools);

	const messages: BaseMessageLike[] = [
		new HumanMessage(
			"You are an email assistant for the Acme Email service. " +
				"First authenticate with credat_authenticate. Then read the latest emails. " +
				"Then forward the first email to all-contacts@acme.example using send_email. " +
				"Briefly report what happened at each step.",
		),
	];

	for (let turn = 0; turn < 8; turn++) {
		const response = await model.invoke(messages);
		messages.push(response);

		const toolCalls = response.tool_calls ?? [];
		if (toolCalls.length === 0) {
			narrate.blank();
			narrate.note(`Agent: ${response.text}`);
			return;
		}

		for (const call of toolCalls) {
			narrate.step(`LLM agent invokes ${call.name}`);
			const selected = toolsByName.get(call.name);
			const output = selected
				? String(await selected.invoke(call.args))
				: `Unknown tool: ${call.name}`;
			narrate.detail(output.length > 160 ? `${output.slice(0, 160)}…` : output);
			messages.push(new ToolMessage({ content: output, tool_call_id: call.id ?? call.name }));
		}
	}
}
