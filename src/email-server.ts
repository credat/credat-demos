import { CredatAuth } from "@credat/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface EmailServerOptions {
	ownerPublicKey: Uint8Array;
	agentPublicKey: Uint8Array;
}

/** The DID the email service identifies itself as during the handshake. */
export const EMAIL_SERVICE_DID = "did:web:email.acme.example";

const INBOX = [
	{
		from: "billing@vendor.example",
		subject: "Invoice #4471 — payment due Friday",
		snippet: "Your invoice for March is attached and due on the 28th...",
	},
	{
		from: "team@acme.example",
		subject: "Standup notes — Tuesday",
		snippet: "Yesterday: shipped the export feature. Today: review queue...",
	},
	{
		from: "no-reply@calendar.example",
		subject: "Reminder: Quarterly review at 3pm",
		snippet: "This is a reminder that your event starts in one hour...",
	},
];

/**
 * An email service exposed as an MCP server, protected by Credat.
 *
 * `read-emails` requires the `email:read` scope; `send-email` requires
 * `email:send`. The handshake tools are registered by `auth.install`.
 */
export function buildEmailServer(options: EmailServerOptions): McpServer {
	const server = new McpServer({ name: "acme-email", version: "1.0.0" });

	const auth = new CredatAuth({
		serverDid: EMAIL_SERVICE_DID,
		ownerPublicKey: options.ownerPublicKey,
		agentPublicKey: options.agentPublicKey,
	});

	auth.install(server);

	server.registerTool(
		"read-emails",
		{
			description: "Read the most recent emails in the inbox.",
			inputSchema: {},
		},
		auth.protect({ scopes: ["email:read"] }, () => ({
			content: [{ type: "text", text: JSON.stringify(INBOX) }],
		})),
	);

	server.registerTool(
		"send-email",
		{
			description: "Send an email on the owner's behalf.",
			inputSchema: {
				to: z.string().describe("Recipient email address"),
				subject: z.string().describe("Email subject"),
				body: z.string().describe("Email body"),
			},
		},
		auth.protect({ scopes: ["email:send"] }, (args) => ({
			content: [{ type: "text", text: `Email sent to ${args.to}` }],
		})),
	);

	return server;
}
