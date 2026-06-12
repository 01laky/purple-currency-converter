import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { MAX_AMOUNT } from '../src/lib/constants.js';
import type { ApiErrorBody } from '../src/lib/types.js';
import { UnknownRateCurrencyError } from '../src/rates/errors.js';
import type { RatesProvider } from '../src/rates/types.js';
import type { ConvertResponse } from '../src/schemas.js';

// Additive at v0.11.0 (the edge-case pass): the exact validation BOUNDARIES of the amount —
// the catalog tests of app.convert.test.ts prove every key fires, these prove WHERE. A fresh
// app instance per rule 29 (the shared suite apps stay untouched) — and it keeps the requests
// out of the shared rate-limit window.

/**
 * @name createProviderStub
 *
 * @description Test stub of the rates provider injected through the buildApp DI seam (rule 1).
 *
 * @returns {RatesProvider} the stubbed provider
 */
const createProviderStub = (): RatesProvider => ({
	getRate: async () => ({ rate: 2, rateTimestamp: '2026-06-12T10:00:00.000Z' }),
	getSupportedCurrencies: async () => ['EUR', 'GBP'],
	getCurrencies: async () => ({ EUR: 'Euro', GBP: 'British Pound' }),
	getCacheAgeSeconds: () => 0,
});

/**
 * @name postConvert
 *
 * @description Test helper — POSTs a body to /api/convert on the given app.
 *
 * @param {FastifyInstance} target the app instance to hit
 * @param {unknown} payload the request body
 *
 * @returns {ReturnType<FastifyInstance['inject']>} the injection result
 */
const postConvert = (target: FastifyInstance, payload: unknown) =>
	target.inject({
		method: 'POST',
		url: '/api/convert',
		payload: JSON.stringify(payload),
		headers: { 'content-type': 'application/json' },
	});

let app: FastifyInstance;

beforeAll(async () => {
	app = await buildApp({ ratesProvider: createProviderStub() });
	await app.ready();
});

afterAll(async () => {
	await app.close();
});

describe('POST /api/convert — the exact amount boundaries', () => {
	it('accepts EXACTLY MAX_AMOUNT (1e12) — the bound is inclusive', async () => {
		const response = await postConvert(app, { amount: MAX_AMOUNT, from: 'EUR', to: 'GBP' });

		expect(response.statusCode).toBe(200);
		expect(response.json<ConvertResponse>().result).toBe(MAX_AMOUNT * 2);
	});

	it('rejects the first representable value ABOVE the bound with amountTooLarge', async () => {
		const response = await postConvert(app, { amount: MAX_AMOUNT + 0.01, from: 'EUR', to: 'GBP' });

		expect(response.statusCode).toBe(400);
		expect(response.json<ApiErrorBody>().error.key).toBe('errors.validation.amountTooLarge');
	});

	it('accepts the smallest valid amount (0.01)', async () => {
		const response = await postConvert(app, { amount: 0.01, from: 'EUR', to: 'GBP' });

		expect(response.statusCode).toBe(200);
		expect(response.json<ConvertResponse>().result).toBe(0.02);
	});

	it('rejects exactly 0 with amountNotPositive — the pristine-default contract', async () => {
		const response = await postConvert(app, { amount: 0, from: 'EUR', to: 'GBP' });

		expect(response.statusCode).toBe(400);
		expect(response.json<ApiErrorBody>().error.key).toBe('errors.validation.amountNotPositive');
	});

	it('accepts exactly 2 decimals and rejects exactly 3 — the decimals boundary', async () => {
		const twoDecimals = await postConvert(app, { amount: 1.23, from: 'EUR', to: 'GBP' });
		const threeDecimals = await postConvert(app, { amount: 1.234, from: 'EUR', to: 'GBP' });

		expect(twoDecimals.statusCode).toBe(200);
		expect(threeDecimals.statusCode).toBe(400);
		expect(threeDecimals.json<ApiErrorBody>().error.key).toBe(
			'errors.validation.amountTooManyDecimals',
		);
	});
});

describe('the supported-list race (the v0.11.0 adversarial pass)', () => {
	it('maps an UnknownRateCurrencyError escaping past the supported check to 422, never 500', async () => {
		// the race: the currency passes getSupportedCurrencies(), then the cache refetches and
		// the currency vanishes — getRate throws past the polite validation; §3 forbids the 500
		const racingProvider: RatesProvider = {
			...createProviderStub(),
			getRate: async () => {
				throw new UnknownRateCurrencyError('GBP');
			},
		};
		const racingApp = await buildApp({ ratesProvider: racingProvider });

		const response = await postConvert(racingApp, { amount: 1, from: 'EUR', to: 'GBP' });

		expect(response.statusCode).toBe(422);
		expect(response.json<ApiErrorBody>()).toEqual({
			error: {
				code: 'UNSUPPORTED_CURRENCY',
				key: 'errors.unsupportedCurrency',
				message: 'Currency GBP is not supported',
				params: { code: 'GBP' },
			},
		});
		await racingApp.close();
	});
});
