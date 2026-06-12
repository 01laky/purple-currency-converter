import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { RatesProvider } from '../src/rates/types.js';

/**
 * @name createProviderStub
 *
 * @description Test stub of the rates provider (rule 1 — no real OER).
 *
 * @returns {RatesProvider} the stubbed provider
 */
const createProviderStub = (): RatesProvider => ({
	getRate: async () => ({ rate: 1, rateTimestamp: '2026-06-12T10:00:00.000Z' }),
	getSupportedCurrencies: async () => ['EUR', 'GBP'],
	getCurrencies: async () => ({ EUR: 'Euro', GBP: 'British Pound' }),
	getCacheAgeSeconds: () => null,
});

let app: FastifyInstance;

beforeAll(async () => {
	app = await buildApp({ ratesProvider: createProviderStub() });
	await app.ready();
});

afterAll(async () => {
	await app.close();
});

describe('the no-store endpoints (§3 revised at 0.10.0)', () => {
	it('GET /health sends Cache-Control: no-store — cached diagnostics lie', async () => {
		const response = await app.inject({ method: 'GET', url: '/health' });

		expect(response.statusCode).toBe(200);
		expect(response.headers['cache-control']).toBe('no-store');
	});

	it('GET /api/currencies keeps its public max-age — no-store guards the fresh endpoints, not everything', async () => {
		const response = await app.inject({ method: 'GET', url: '/api/currencies' });

		expect(response.statusCode).toBe(200);
		expect(response.headers['cache-control']).toBe('public, max-age=3600');
	});
});
