import type { AuthenticateResponse, ITransport } from "@credat/langchain";
import { createTransport } from "@credat/langchain";
import type { ChallengeMessage, PresentationMessage } from "@credat/sdk";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

function firstText(result: CallToolResult): string {
	const block = result.content.find((b) => b.type === "text");
	if (!block || block.type !== "text") {
		throw new Error("MCP tool returned no text content");
	}
	return block.text;
}

/**
 * Bridges `@credat/langchain`'s transport interface to an MCP client, so a
 * LangChain agent can run the Credat handshake against an MCP server.
 *
 * `@credat/langchain` ships an `HttpTransport`; this is the equivalent for
 * services exposed over the Model Context Protocol.
 */
export function createMcpTransport(client: Client): ITransport {
	return createTransport({
		requestChallenge: async (): Promise<ChallengeMessage> => {
			const result = (await client.callTool({ name: "credat:challenge" })) as CallToolResult;
			return JSON.parse(firstText(result)) as ChallengeMessage;
		},

		sendPresentation: async (presentation: PresentationMessage): Promise<AuthenticateResponse> => {
			const result = (await client.callTool({
				name: "credat:authenticate",
				arguments: { presentation },
			})) as CallToolResult;

			const data = JSON.parse(firstText(result)) as {
				authenticated?: boolean;
				scopes?: string[];
				error?: string;
			};

			if (result.isError || !data.authenticated) {
				return { authenticated: false, error: data.error ?? "authentication rejected" };
			}
			return { authenticated: true, scopes: data.scopes };
		},
	});
}
