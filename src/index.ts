/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/api/shorten") {
			if (request.method !== "POST") {
				return Response.json(
					{ error: "Method not allowed" },
					{ status: 405, headers: { Allow: "POST" } },
				);
			}

			let body: { url?: unknown };
			try {
				body = (await request.json()) as { url?: unknown };
			} catch {
				return Response.json({ error: "Invalid JSON body" }, { status: 400 });
			}

			if (typeof body.url !== "string") {
				return Response.json({ error: "Field 'url' is required" }, { status: 400 });
			}

			let target: URL;
			try {
				target = new URL(body.url);
			} catch {
				return Response.json({ error: "Field 'url' must be a valid URL" }, { status: 400 });
			}

			if (target.protocol !== "http:" && target.protocol !== "https:") {
				return Response.json(
					{ error: "Only http and https URLs are supported" },
					{ status: 400 },
				);
			}

			const shortCode = crypto.randomUUID().slice(0, 8);
			const shortUrl = `${url.origin}/${shortCode}`;

			return Response.json(
				{
					shortCode,
					shortUrl,
					originalUrl: target.toString(),
				},
				{ status: 201 },
			);
		}

		return new Response("Hello World!");
	},
} satisfies ExportedHandler<Env>;
