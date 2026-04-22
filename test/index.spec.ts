import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { beforeEach, describe, it, expect } from "vitest";
import worker from "../src/index";

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

beforeEach(async () => {
	await env.cloudcut_db
		.prepare(
			"CREATE TABLE IF NOT EXISTS links (id INTEGER PRIMARY KEY AUTOINCREMENT, short_code TEXT NOT NULL UNIQUE, original_url TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), visit_count INTEGER NOT NULL DEFAULT 0)",
		)
		.run();
	await env.cloudcut_db.exec("DELETE FROM links");
});

describe("Hello World worker", () => {
	it("responds with Hello World! (unit style)", async () => {
		const request = new IncomingRequest("http://example.com");
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		expect(await response.text()).toMatchInlineSnapshot(`"Hello World!"`);
	});

	it("responds with Hello World! (integration style)", async () => {
		const response = await SELF.fetch("https://example.com");
		expect(await response.text()).toMatchInlineSnapshot(`"Hello World!"`);
	});

	it("creates a short URL with POST /api/shorten", async () => {
		const request = new IncomingRequest("http://example.com/api/shorten", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ url: "https://example.org/very/long/path" }),
		});

		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(201);
		const json = (await response.json()) as {
			shortCode: string;
			shortUrl: string;
			originalUrl: string;
		};

		expect(json.originalUrl).toBe("https://example.org/very/long/path");
		expect(json.shortCode).toMatch(/^[a-f0-9]{8}$/i);
		expect(json.shortUrl).toMatch(/^http:\/\/example.com\/[a-f0-9]{8}$/i);

		const record = await env.cloudcut_db
			.prepare("SELECT short_code, original_url, visit_count FROM links WHERE short_code = ?1")
			.bind(json.shortCode)
			.first<{ short_code: string; original_url: string; visit_count: number }>();

		expect(record).toEqual({
			short_code: json.shortCode,
			original_url: "https://example.org/very/long/path",
			visit_count: 0,
		});
	});

	it("rejects invalid payload on POST /api/shorten", async () => {
		const request = new IncomingRequest("http://example.com/api/shorten", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ url: "not-a-valid-url" }),
		});

		const response = await worker.fetch(request, env, createExecutionContext());
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Field 'url' must be a valid URL",
		});
	});

	it("redirects GET /:code and increments visit_count", async () => {
		const createResponse = await worker.fetch(
			new IncomingRequest("http://example.com/api/shorten", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ url: "https://developers.cloudflare.com" }),
			}),
			env,
			createExecutionContext(),
		);

		const { shortCode } = (await createResponse.json()) as { shortCode: string };

		const redirectResponse = await worker.fetch(
			new IncomingRequest(`http://example.com/${shortCode}`, {
				redirect: "manual",
			}),
			env,
			createExecutionContext(),
		);

		expect(redirectResponse.status).toBe(302);
		expect(redirectResponse.headers.get("Location")).toBe("https://developers.cloudflare.com/");

		const record = await env.cloudcut_db
			.prepare("SELECT visit_count FROM links WHERE short_code = ?1")
			.bind(shortCode)
			.first<{ visit_count: number }>();

		expect(record?.visit_count).toBe(1);
	});

	it("returns stats for GET /api/stats/:code", async () => {
		const createResponse = await worker.fetch(
			new IncomingRequest("http://example.com/api/shorten", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ url: "https://example.com/articles/1" }),
			}),
			env,
			createExecutionContext(),
		);

		const { shortCode } = (await createResponse.json()) as { shortCode: string };

		await worker.fetch(
			new IncomingRequest(`http://example.com/${shortCode}`, {
				redirect: "manual",
			}),
			env,
			createExecutionContext(),
		);

		const statsResponse = await worker.fetch(
			new IncomingRequest(`http://example.com/api/stats/${shortCode}`),
			env,
			createExecutionContext(),
		);

		expect(statsResponse.status).toBe(200);
		const json = (await statsResponse.json()) as {
			code: string;
			originalUrl: string;
			createdAt: string;
			clicks: number;
		};

		expect(json.code).toBe(shortCode);
		expect(json.originalUrl).toBe("https://example.com/articles/1");
		expect(json.createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
		expect(json.clicks).toBe(1);
	});

	it("returns 404 for GET /api/stats/:code when code is unknown", async () => {
		const response = await worker.fetch(
			new IncomingRequest("http://example.com/api/stats/deadbeef"),
			env,
			createExecutionContext(),
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Short code not found" });
	});

	it("returns 404 when code is unknown", async () => {
		const response = await worker.fetch(
			new IncomingRequest("http://example.com/doesnotexist"),
			env,
			createExecutionContext(),
		);

		expect(response.status).toBe(404);
		expect(await response.text()).toBe("Not Found");
	});
});
