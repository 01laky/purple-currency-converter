import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { DEFAULT_FRONTEND_ORIGIN } from '../src/lib/constants.js';

let app: FastifyInstance;

beforeAll(async () => {
	app = await buildApp();
	await app.ready();
});

afterAll(async () => {
	await app.close();
});

describe('CORS for the local web dev (§10)', () => {
	it('answers the exact frontend origin — never *', async () => {
		const response = await app.inject({
			method: 'GET',
			url: '/health',
			headers: { origin: DEFAULT_FRONTEND_ORIGIN },
		});

		expect(response.statusCode).toBe(200);
		expect(response.headers['access-control-allow-origin']).toBe(DEFAULT_FRONTEND_ORIGIN);
		expect(response.headers['access-control-allow-origin']).not.toBe('*');
	});

	it('handles the preflight for POST /api/convert', async () => {
		const response = await app.inject({
			method: 'OPTIONS',
			url: '/api/convert',
			headers: {
				origin: DEFAULT_FRONTEND_ORIGIN,
				'access-control-request-method': 'POST',
				'access-control-request-headers': 'content-type',
			},
		});

		expect(response.statusCode).toBeLessThan(300);
		expect(response.headers['access-control-allow-origin']).toBe(DEFAULT_FRONTEND_ORIGIN);
	});
});
