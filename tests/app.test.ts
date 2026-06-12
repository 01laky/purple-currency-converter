import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { buildApp } from '../src/app.js';
import type { HealthResponse } from '../src/schemas.js';
import type { ApiErrorBody } from '../src/lib/types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let app: FastifyInstance;

beforeAll(async () => {
	app = await buildApp();
	// test-only routes: /boom exercises the 500 branch, /echo gives the body parser a target
	app.get('/boom', () => {
		throw new Error('test explosion');
	});
	app.post('/echo', async (request) => request.body);
	await app.ready();
});

afterAll(async () => {
	await app.close();
});

describe('GET /health', () => {
	it('returns the diagnostic shape with the package.json version', async () => {
		const response = await app.inject({ method: 'GET', url: '/health' });

		expect(response.statusCode).toBe(200);
		const body = response.json<HealthResponse>();
		expect(body.ok).toBe(true);
		expect(body.version).toBe(pkg.version);
		expect(typeof body.uptime).toBe('number');
		expect(body.ratesCacheAge).toBeNull();
	});
});

describe('the central error handler', () => {
	it('returns NOT_FOUND in the unified shape for an unknown route', async () => {
		const response = await app.inject({ method: 'GET', url: '/definitely-not-here' });

		expect(response.statusCode).toBe(404);
		const body = response.json<ApiErrorBody>();
		expect(body.error.code).toBe('NOT_FOUND');
		expect(body.error.key).toBe('errors.notFound');
		expect(body.error.message).toBe('Resource not found');
	});

	it('returns VALIDATION_ERROR in the unified shape for malformed JSON', async () => {
		const response = await app.inject({
			method: 'POST',
			url: '/echo',
			headers: { 'content-type': 'application/json' },
			payload: '{ definitely broken',
		});

		expect(response.statusCode).toBe(400);
		const body = response.json<ApiErrorBody>();
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.key).toBe('errors.validation.invalidRequest');
	});

	it('keeps the unified shape for a body over the 1 MB limit', async () => {
		const response = await app.inject({
			method: 'POST',
			url: '/echo',
			headers: { 'content-type': 'application/json' },
			payload: JSON.stringify({ data: 'x'.repeat(1_100_000) }),
		});

		expect(response.statusCode).toBe(413);
		const body = response.json<ApiErrorBody>();
		expect(body.error.code).toBe('VALIDATION_ERROR');
	});

	it('returns INTERNAL_ERROR without leaking any internals', async () => {
		const response = await app.inject({ method: 'GET', url: '/boom' });

		expect(response.statusCode).toBe(500);
		const body = response.json<ApiErrorBody>();
		expect(body.error.code).toBe('INTERNAL_ERROR');
		expect(body.error.key).toBe('errors.internal');
		expect(body.error.message).toBe('Internal server error');
		expect(response.body).not.toContain('test explosion');
		expect(response.body).not.toContain('stack');
	});
});

describe('the request id', () => {
	it('is present as X-Request-Id and unique per request', async () => {
		const first = await app.inject({ method: 'GET', url: '/health' });
		const second = await app.inject({ method: 'GET', url: '/health' });

		const firstId = first.headers['x-request-id'];
		const secondId = second.headers['x-request-id'];
		expect(typeof firstId).toBe('string');
		expect(typeof secondId).toBe('string');
		expect(firstId).toMatch(UUID_PATTERN);
		expect(firstId).not.toBe(secondId);
	});
});

describe('the OpenAPI document', () => {
	it('is served at /docs/json and contains /health', async () => {
		const response = await app.inject({ method: 'GET', url: '/docs/json' });

		expect(response.statusCode).toBe(200);
		const document = response.json<{ paths: Record<string, unknown> }>();
		expect(document.paths['/health']).toBeDefined();
	});
});
