import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

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
		expect(json.shortCode).toMatch(/^[a-f0-9-]{8}$/i);
		expect(json.shortUrl).toMatch(/^http:\/\/example.com\/[a-f0-9-]{8}$/i);
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
});
