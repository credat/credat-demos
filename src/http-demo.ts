import type { AddressInfo } from "node:net";
import { CredatHttp } from "@credat/http";
import { expressHandler, expressProtect } from "@credat/http/express";
import type { ChallengeMessage } from "@credat/sdk";
import {
	createAgent,
	createDidWeb,
	delegate,
	generateKeyPair,
	presentCredentials,
} from "@credat/sdk";
import express from "express";
import * as narrate from "./narrate.js";

const INBOX = [
	{
		from: "billing@vendor.example",
		subject: "Invoice #4471 — payment due Friday",
	},
	{
		from: "team@acme.example",
		subject: "Standup notes — Tuesday",
	},
	{
		from: "no-reply@calendar.example",
		subject: "Reminder: Quarterly review at 3pm",
	},
];

function buildEmailService(opts: { ownerPublicKey: Uint8Array; agentPublicKey: Uint8Array }): {
	app: express.Express;
	http: CredatHttp;
} {
	const http = new CredatHttp({
		serverDid: "did:web:email.acme.example",
		ownerPublicKey: opts.ownerPublicKey,
		agentPublicKey: opts.agentPublicKey,
	});

	const app = express();
	app.use(express.json());

	app.post(http.paths.challenge, expressHandler(http.handlers().challenge));
	app.post(http.paths.authenticate, expressHandler(http.handlers().authenticate));

	app.get("/emails", expressProtect(http.protect({ scopes: ["email:read"] })), (_req, res) => {
		res.json({ inbox: INBOX });
	});

	app.post("/emails/send", expressProtect(http.protect({ scopes: ["email:send"] })), (req, res) => {
		res.json({ sent: true, to: req.body.to });
	});

	return { app, http };
}

async function main(): Promise<void> {
	narrate.title("Credat HTTP demo — scoped email access over plain HTTP");
	narrate.rule();

	// ── 1. Owner delegates email:read (NOT email:send) ──
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

	// ── 2. Build the Express email service ──
	narrate.section("2. Email service (Express + @credat/http)");

	const { app, http } = buildEmailService({
		ownerPublicKey: ownerKeyPair.publicKey,
		agentPublicKey: agent.keyPair.publicKey,
	});

	const server = app.listen(0);
	await new Promise<void>((resolve) => server.once("listening", resolve));
	const port = (server.address() as AddressInfo).port;
	const baseUrl = `http://127.0.0.1:${port}`;

	narrate.step(`Service listening on ${baseUrl}`);
	narrate.step(`POST ${http.paths.challenge}     →  issue handshake nonce`);
	narrate.step(`POST ${http.paths.authenticate}  →  exchange presentation for session`);
	narrate.step(`GET  /emails                 →  requires scope email:read`);
	narrate.step(`POST /emails/send            →  requires scope email:send`);
	narrate.blank();

	try {
		// ── 3. Agent runs the handshake over HTTP ──
		narrate.section("3. Agent authenticates over HTTP");

		narrate.step("POST /credat/challenge");
		const challengeRes = await fetch(`${baseUrl}${http.paths.challenge}`, { method: "POST" });
		const challenge = (await challengeRes.json()) as ChallengeMessage;
		narrate.detail(`server nonce: ${challenge.nonce.slice(0, 16)}...`);

		const presentation = await presentCredentials({
			challenge,
			delegation: delegation.token,
			agent,
		});

		narrate.step("POST /credat/authenticate { presentation }");
		const authRes = await fetch(`${baseUrl}${http.paths.authenticate}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ presentation }),
		});
		const auth = (await authRes.json()) as {
			authenticated: boolean;
			sessionToken?: string;
			scopes?: string[];
			error?: string;
		};

		if (!auth.authenticated || !auth.sessionToken) {
			narrate.deny(`Handshake failed: ${auth.error ?? JSON.stringify(auth)}`);
			return;
		}
		narrate.allow(`Session established — granted scopes: ${(auth.scopes ?? []).join(", ")}`);
		narrate.detail(`bearer: ${auth.sessionToken.slice(0, 16)}...`);
		narrate.blank();

		// ── 4. Read — allowed ──
		narrate.section("4. Agent makes scoped requests");

		narrate.step("GET /emails   Authorization: Bearer <token>");
		const readRes = await fetch(`${baseUrl}/emails`, {
			headers: { authorization: `Bearer ${auth.sessionToken}` },
		});
		if (readRes.ok) {
			const data = (await readRes.json()) as { inbox: typeof INBOX };
			narrate.allow(`200 OK — ${data.inbox.length} messages:`);
			for (const mail of data.inbox) {
				narrate.detail(`"${mail.subject}"  ·  ${mail.from}`);
			}
		} else {
			narrate.deny(`Unexpected ${readRes.status} on read: ${await readRes.text()}`);
		}
		narrate.blank();

		// ── 5. Send — rejected ──
		narrate.step("POST /emails/send   Authorization: Bearer <token>");
		const sendRes = await fetch(`${baseUrl}/emails/send`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${auth.sessionToken}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				to: "all-contacts@acme.example",
				subject: "FW: Invoice #4471",
				body: "Forwarding this along.",
			}),
		});

		if (sendRes.ok) {
			narrate.deny("send succeeded — UNEXPECTED: the agent was never granted email:send");
		} else {
			const err = (await sendRes.json()) as { error: string; code: string; details?: string[] };
			narrate.deny(`${sendRes.status} ${err.code} — ${err.error}`);
			for (const line of err.details ?? []) narrate.detail(line);
		}
	} finally {
		await new Promise<void>((resolve, reject) => {
			server.close((err) => (err ? reject(err) : resolve()));
		});
	}

	// ── 6. Summary ──
	narrate.blank();
	narrate.rule();
	narrate.section("What just happened");
	narrate.detail("• The agent ran the Credat handshake against two plain HTTP endpoints.");
	narrate.detail("• Express middleware verified the delegation and issued a bearer session.");
	narrate.detail("• On every protected request, @credat/http checked the bearer's scopes.");
	narrate.detail("• Read was allowed; send was denied — same enforcement, plain HTTP.");
	narrate.blank();
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
