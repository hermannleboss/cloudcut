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

			let shortCode = "";
			for (let attempt = 0; attempt < 5; attempt++) {
				const candidate = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
				try {
					await env.cloudcut_db
						.prepare("INSERT INTO links (short_code, original_url) VALUES (?1, ?2)")
						.bind(candidate, target.toString())
						.run();
					shortCode = candidate;
					break;
				} catch (error) {
					if (isUniqueConstraintError(error)) {
						continue;
					}
					return Response.json({ error: "Failed to save short link" }, { status: 500 });
				}
			}

			if (!shortCode) {
				return Response.json({ error: "Failed to generate short code" }, { status: 500 });
			}

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

		if (request.method === "GET") {
			const shortCode = url.pathname.slice(1);
			if (shortCode && !shortCode.includes("/")) {
				const record = await env.cloudcut_db
					.prepare("SELECT original_url FROM links WHERE short_code = ?1 LIMIT 1")
					.bind(shortCode)
					.first<{ original_url: string }>();

				if (!record) {
					return new Response("Not Found", { status: 404 });
				}

				await env.cloudcut_db
					.prepare("UPDATE links SET visit_count = visit_count + 1 WHERE short_code = ?1")
					.bind(shortCode)
					.run();

				return Response.redirect(record.original_url, 302);
			}
		}

		return new Response("Hello World!");
	},
} satisfies ExportedHandler<Env>;

function isUniqueConstraintError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	return error.message.includes("UNIQUE constraint failed");
}
