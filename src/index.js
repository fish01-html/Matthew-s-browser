import { createServer } from "node:http";
import { fileURLToPath } from "url";
import { hostname } from "node:os";
import { createHash, timingSafeEqual } from "node:crypto";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const publicPath = fileURLToPath(new URL("../public/", import.meta.url));

// Wisp Configuration: Refer to the documentation at https://www.npmjs.com/package/@mercuryworkshop/wisp-js

logging.set_level(logging.NONE);
Object.assign(wisp.options, {
	allow_udp_streams: false,
	allow_private_ips: false,
	allow_loopback_ips: false,
});

const password = process.env.BROWSER_PASSWORD;
if (!password || password.length < 12) {
	throw new Error("Set BROWSER_PASSWORD to at least 12 characters before starting.");
}
const sessionToken = createHash("sha256").update(`MatthewBrowser:${password}`).digest("hex");
const sessionCookie = `browser_session=${sessionToken}`;

function authenticated(header = "") {
	const value = header.split(";").map((part) => part.trim()).find((part) => part.startsWith("browser_session="));
	if (!value) return false;
	const actual = Buffer.from(value.slice("browser_session=".length));
	const expected = Buffer.from(sessionToken);
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const fastify = Fastify({
	serverFactory: (handler) => {
		return createServer()
			.on("request", (req, res) => {
				res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
				res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
				handler(req, res);
			})
			.on("upgrade", (req, socket, head) => {
				if (req.url.endsWith("/wisp/") && authenticated(req.headers.cookie)) wisp.routeRequest(req, socket, head);
				else socket.end();
			});
	},
});

fastify.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
	done(null, Object.fromEntries(new URLSearchParams(body)));
});

fastify.addHook("onRequest", async (request, reply) => {
	if (["/login", "/health"].includes(request.url.split("?")[0])) return;
	if (!authenticated(request.headers.cookie)) return reply.redirect("/login");
});

fastify.get("/health", async () => ({ ready: true }));
fastify.get("/login", async (_request, reply) => reply.type("text/html").send(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Matthew Browser — Sign in</title><style>
body{min-height:100vh;display:grid;place-items:center;margin:0;background:#101824;color:#f5f7fb;font:16px system-ui}
form{width:min(360px,calc(100vw - 40px));padding:32px;background:#1e2a3b;border-radius:18px}
h1{margin-top:0;font-size:24px}input,button{box-sizing:border-box;width:100%;padding:14px;margin-top:12px;border-radius:9px;font:inherit}
input{background:white;border:0}button{background:#70d8ec;color:#10202b;border:0;font-weight:700;cursor:pointer}
</style><form method="post" action="/login"><h1>Matthew Browser</h1><label for="password">Password</label>
<input id="password" name="password" type="password" required autocomplete="current-password"><button>Open browser</button></form></html>`));
fastify.post("/login", async (request, reply) => {
	const actual = Buffer.from(request.body?.password || "");
	const expected = Buffer.from(password);
	if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
		return reply.code(401).type("text/plain").send("Wrong password. Go back and try again.");
	}
	const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
	reply.header("Set-Cookie", `${sessionCookie}; HttpOnly${secure}; SameSite=Lax; Path=/`);
	return reply.redirect("/");
});

fastify.register(fastifyStatic, {
	root: publicPath,
	decorateReply: true,
});

fastify.register(fastifyStatic, {
	root: scramjetPath,
	prefix: "/scram/",
	decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: libcurlPath,
	prefix: "/libcurl/",
	decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: baremuxPath,
	prefix: "/baremux/",
	decorateReply: false,
});

fastify.setNotFoundHandler((res, reply) => {
	return reply.code(404).type("text/html").sendFile("404.html");
});

fastify.server.on("listening", () => {
	const address = fastify.server.address();

	// by default we are listening on 0.0.0.0 (every interface)
	// we just need to list a few
	console.log("Listening on:");
	console.log(`\thttp://localhost:${address.port}`);
	console.log(`\thttp://${hostname()}:${address.port}`);
	console.log(
		`\thttp://${
			address.family === "IPv6" ? `[${address.address}]` : address.address
		}:${address.port}`
	);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
	console.log("SIGTERM signal received: closing HTTP server");
	fastify.close();
	process.exit(0);
}

let port = parseInt(process.env.PORT || "");

if (isNaN(port)) port = 8080;

fastify.listen({
	port: port,
	host: process.env.HOST || "0.0.0.0",
});
