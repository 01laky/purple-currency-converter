import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { ApiErrorBody } from '../src/lib/types.js';
import type { RatesProvider } from '../src/rates/types.js';
import type { StatsRepository } from '../src/stats/types.js';

// The DI-injected low max (prompt v0.11.0): the 429 arrives after a handful of requests on this
// DEDICATED app instance — the shared suite apps keep the production default and their headroom
const TEST_MAX = 3;

const RATE_TIMESTAMP = '2026-06-12T10:00:00.000Z';

/**
 * @name createProviderStub
 *
 * @description Test stub of the rates provider injected through the buildApp DI seam (rule 1).
 *
 * @returns {RatesProvider} the stubbed provider
 */
const createProviderStub = (): RatesProvider => ({
	getRate: async () => ({ rate: 1.5, rateTimestamp: RATE_TIMESTAMP }),
	getSupportedCurrencies: async () => ['EUR', 'GBP', 'USD'],
	getCurrencies: async () => ({ EUR: 'Euro', GBP: 'British Pound', USD: 'US Dollar' }),
	getCacheAgeSeconds: () => 0,
});

/**
 * @name createStatsStub
 *
 * @description Test stub of the statistics repository — counts the writes so the tests can
 * assert that rate-limited and invalid requests never reach the statistics step.
 *
 * @returns {{ repository: StatsRepository, writes: () => number }} the stub and its write counter
 */
const createStatsStub = (): { repository: StatsRepository; writes: () => number } => {
	let writeCount = 0;
	return {
		repository: {
			recordConversion: async () => {
				writeCount += 1;
			},
			getStats: async () => ({ totalConversions: 0, totalAmountEur: 0, topTargetCurrency: null }),
		},
		writes: () => writeCount,
	};
};

/**
 * @name postConvert
 *
 * @description Test helper — POSTs a body to /api/convert, optionally with an x-forwarded-for
 * header (the trustProxy keying input).
 *
 * @param {FastifyInstance} target the app instance to hit
 * @param {unknown} payload the request body
 * @param {string} forwardedFor optional x-forwarded-for header value
 *
 * @returns {ReturnType<FastifyInstance['inject']>} the injection result
 */
const postConvert = (target: FastifyInstance, payload: unknown, forwardedFor?: string) =>
	target.inject({
		method: 'POST',
		url: '/api/convert',
		payload: JSON.stringify(payload),
		headers: {
			'content-type': 'application/json',
			...(forwardedFor !== undefined ? { 'x-forwarded-for': forwardedFor } : {}),
		},
	});

const VALID_BODY = { amount: 1, from: 'EUR', to: 'GBP' };

describe('the §9 rate limit on POST /api/convert', () => {
	it('answers the over-limit request with the unified 429 shape', async () => {
		const stats = createStatsStub();
		const app = await buildApp({
			ratesProvider: createProviderStub(),
			statsRepository: stats.repository,
			rateLimitMax: TEST_MAX,
		});

		for (let i = 0; i < TEST_MAX; i += 1) {
			const response = await postConvert(app, VALID_BODY);
			expect(response.statusCode).toBe(200);
		}
		const overLimit = await postConvert(app, VALID_BODY);

		expect(overLimit.statusCode).toBe(429);
		// the FULL body — proves the errorResponseBuilder shape survives the zod serializer
		expect(overLimit.json<ApiErrorBody>()).toEqual({
			error: {
				code: 'RATE_LIMITED',
				key: 'errors.rateLimited',
				message: 'Too many requests, please try again later',
			},
		});
		// the limited request never reached the handler — no statistics write
		expect(stats.writes()).toBe(TEST_MAX);
		await app.close();
	});

	it('keys per IP — a DIFFERENT viewer IP still converts after another is exhausted', async () => {
		const stats = createStatsStub();
		const app = await buildApp({
			ratesProvider: createProviderStub(),
			statsRepository: stats.repository,
			rateLimitMax: TEST_MAX,
		});

		for (let i = 0; i < TEST_MAX; i += 1) {
			await postConvert(app, VALID_BODY, '203.0.113.7');
		}
		const exhausted = await postConvert(app, VALID_BODY, '203.0.113.7');
		const otherViewer = await postConvert(app, VALID_BODY, '203.0.113.99');

		expect(exhausted.statusCode).toBe(429);
		expect(otherViewer.statusCode).toBe(200);
		await app.close();
	});

	it('ignores a client-forged x-forwarded-for prefix — trustProxy is a hop count, not blind trust', async () => {
		const stats = createStatsStub();
		const app = await buildApp({
			ratesProvider: createProviderStub(),
			statsRepository: stats.repository,
			rateLimitMax: TEST_MAX,
		});

		// the rightmost entry (the hop CloudFront appends) stays constant; the forged leftmost
		// prefix VARIES — with trustProxy: true each request would land in a fresh bucket and
		// the limiter would never trip
		for (let i = 0; i < TEST_MAX; i += 1) {
			await postConvert(app, VALID_BODY, `198.51.100.${i}, 203.0.113.7`);
		}
		const overLimit = await postConvert(app, VALID_BODY, '198.51.100.250, 203.0.113.7');

		expect(overLimit.statusCode).toBe(429);
		await app.close();
	});

	it('counts BEFORE validation — invalid requests trip the limiter with zero statistics writes', async () => {
		const stats = createStatsStub();
		const app = await buildApp({
			ratesProvider: createProviderStub(),
			statsRepository: stats.repository,
			rateLimitMax: TEST_MAX,
		});

		// the production spot check relies on exactly this: from = to fails validation (400),
		// yet the onRequest-hook limiter counts it — the 429 arrives without one written record
		const invalidBody = { amount: 1, from: 'EUR', to: 'EUR' };
		for (let i = 0; i < TEST_MAX; i += 1) {
			const response = await postConvert(app, invalidBody);
			expect(response.statusCode).toBe(400);
		}
		const overLimit = await postConvert(app, invalidBody);

		expect(overLimit.statusCode).toBe(429);
		expect(stats.writes()).toBe(0);
		await app.close();
	});

	it('leaves /api/stats unlimited — the read endpoints are out of the §9 scope', async () => {
		const stats = createStatsStub();
		const app = await buildApp({
			ratesProvider: createProviderStub(),
			statsRepository: stats.repository,
			rateLimitMax: TEST_MAX,
		});

		for (let i = 0; i < TEST_MAX + 2; i += 1) {
			const response = await app.inject({ method: 'GET', url: '/api/stats' });
			expect(response.statusCode).toBe(200);
		}
		await app.close();
	});
});
