import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { RateProviderUnavailableError } from '../src/rates/errors.js';
import type { RatesProvider } from '../src/rates/types.js';
import type { CurrenciesResponse } from '../src/schemas.js';
import type { ApiErrorBody } from '../src/lib/types.js';

const CURRENCIES_FIXTURE = { EUR: 'Euro', GBP: 'British Pound', USD: 'US Dollar' };

/**
 * @name createProviderStub
 *
 * @description Test stub of the rates provider injected through the buildApp DI seam (rule 1 —
 * the route tests never touch the real OER client).
 *
 * @param {() => Promise<Record<string, string>>} getCurrencies the behavior of the test case
 *
 * @returns {RatesProvider} the stubbed provider
 */
const createProviderStub = (
	getCurrencies: () => Promise<Record<string, string>>,
): RatesProvider => ({
	getRate: async () => ({ rate: 1, rateTimestamp: new Date(0).toISOString() }),
	getSupportedCurrencies: async () => Object.keys(CURRENCIES_FIXTURE),
	getCurrencies,
	getCacheAgeSeconds: () => null,
});

let app: FastifyInstance;
let failingApp: FastifyInstance;

beforeAll(async () => {
	app = await buildApp({
		ratesProvider: createProviderStub(async () => CURRENCIES_FIXTURE),
	});
	failingApp = await buildApp({
		ratesProvider: createProviderStub(async () => {
			throw new RateProviderUnavailableError(new Error('upstream down'));
		}),
	});
	await app.ready();
	await failingApp.ready();
});

afterAll(async () => {
	await app.close();
	await failingApp.close();
});

describe('GET /api/currencies', () => {
	it('returns the currencies with Cache-Control: public, max-age=3600', async () => {
		const response = await app.inject({ method: 'GET', url: '/api/currencies' });

		expect(response.statusCode).toBe(200);
		expect(response.json<CurrenciesResponse>().currencies).toEqual(CURRENCIES_FIXTURE);
		expect(response.headers['cache-control']).toBe('public, max-age=3600');
	});

	it('maps an unavailable provider to 502 RATE_PROVIDER_ERROR in the unified shape — the catalog test', async () => {
		const response = await failingApp.inject({ method: 'GET', url: '/api/currencies' });

		expect(response.statusCode).toBe(502);
		const body = response.json<ApiErrorBody>();
		expect(body.error.code).toBe('RATE_PROVIDER_ERROR');
		expect(body.error.key).toBe('errors.rateProvider');
		expect(body.error.message).toBe('Exchange rate provider is unavailable');
		expect(response.body).not.toContain('upstream down');
	});

	it('is documented in the OpenAPI specification', async () => {
		const response = await app.inject({ method: 'GET', url: '/docs/json' });

		const document = response.json<{ paths: Record<string, unknown> }>();
		expect(document.paths['/api/currencies']).toBeDefined();
	});
});
