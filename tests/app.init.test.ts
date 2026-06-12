import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '../src/i18n/loader.js';
import { buildApp } from '../src/app.js';
import type { InitResponse } from '../src/schemas.js';

let app: FastifyInstance;

beforeAll(async () => {
	app = await buildApp();
	await app.ready();
});

afterAll(async () => {
	await app.close();
});

describe('GET /api/init', () => {
	it('returns the languages and the complete translation trees', async () => {
		const response = await app.inject({ method: 'GET', url: '/api/init' });

		expect(response.statusCode).toBe(200);
		const body = response.json<InitResponse>();
		expect(body.languages).toEqual(['en', 'cs', 'sk']);
		expect(Object.keys(body.translations).sort()).toEqual(['cs', 'en', 'sk']);
		expect(body.translations['en']).toEqual(TRANSLATIONS.en);
	});

	it('carries a quoted strong ETag, stable across requests, and Cache-Control: no-cache', async () => {
		const first = await app.inject({ method: 'GET', url: '/api/init' });
		const second = await app.inject({ method: 'GET', url: '/api/init' });

		const etag = first.headers['etag'];
		expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
		expect(second.headers['etag']).toBe(etag);
		expect(first.headers['cache-control']).toBe('no-cache');
	});

	it('replies 304 with an empty body to a matching If-None-Match', async () => {
		const fresh = await app.inject({ method: 'GET', url: '/api/init' });
		const etag = fresh.headers['etag'];
		expect(typeof etag).toBe('string');

		const revalidated = await app.inject({
			method: 'GET',
			url: '/api/init',
			headers: { 'if-none-match': String(etag) },
		});

		expect(revalidated.statusCode).toBe(304);
		expect(revalidated.body).toBe('');
		expect(revalidated.headers['etag']).toBe(etag);
		expect(revalidated.headers['cache-control']).toBe('no-cache');
	});

	it('replies 200 with the full body to a stale If-None-Match', async () => {
		const response = await app.inject({
			method: 'GET',
			url: '/api/init',
			headers: {
				'if-none-match': '"0000000000000000000000000000000000000000000000000000000000000000"',
			},
		});

		expect(response.statusCode).toBe(200);
		expect(response.json<InitResponse>().languages).toEqual(['en', 'cs', 'sk']);
	});

	it('is documented in the OpenAPI specification', async () => {
		const response = await app.inject({ method: 'GET', url: '/docs/json' });

		const document = response.json<{ paths: Record<string, unknown> }>();
		expect(document.paths['/api/init']).toBeDefined();
	});
});
