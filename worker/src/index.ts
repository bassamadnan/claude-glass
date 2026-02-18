const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB

export interface Env {
	SESSIONS: R2Bucket;
	UPLOAD_LIMITER: RateLimit;
}

function cors(origin: string | null): Record<string, string> {
	return {
		'Access-Control-Allow-Origin': origin ?? '*',
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	};
}

function json(data: unknown, status = 200, origin: string | null = null): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json', ...cors(origin) },
	});
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const origin = request.headers.get('Origin');

		// CORS preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: cors(origin) });
		}

		// POST /share — upload a session
		if (request.method === 'POST' && url.pathname === '/share') {
			// Rate limit by IP
			const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
			const { success } = await env.UPLOAD_LIMITER.limit({ key: ip });
			if (!success) {
				return json({ error: 'Rate limit exceeded. Try again in a minute.' }, 429, origin);
			}

			// Check content length
			const contentLength = Number(request.headers.get('Content-Length') ?? 0);
			if (contentLength > MAX_UPLOAD_BYTES) {
				return json({ error: 'Payload too large (max 50MB)' }, 413, origin);
			}

			const body = await request.arrayBuffer();
			if (body.byteLength > MAX_UPLOAD_BYTES) {
				return json({ error: 'Payload too large (max 50MB)' }, 413, origin);
			}
			if (body.byteLength === 0) {
				return json({ error: 'Empty body' }, 400, origin);
			}

			// Generate a short ID from a UUID
			const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);

			await env.SESSIONS.put(`${id}.jsonl`, body, {
				httpMetadata: { contentType: 'application/x-ndjson' },
			});

			return json({ id, url: `/s/${id}` }, 200, origin);
		}

		// GET /s/:id — retrieve a session
		const match = url.pathname.match(/^\/s\/([a-f0-9]{12})$/);
		if (request.method === 'GET' && match) {
			const id = match[1];
			const object = await env.SESSIONS.get(`${id}.jsonl`);

			if (!object) {
				return json({ error: 'Not found' }, 404, origin);
			}

			return new Response(object.body, {
				headers: {
					'Content-Type': 'application/x-ndjson',
					'Cache-Control': 'public, max-age=31536000, immutable',
					...cors(origin),
				},
			});
		}

		return json({ error: 'Not found' }, 404, origin);
	},
} satisfies ExportedHandler<Env>;
