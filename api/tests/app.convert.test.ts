import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { RateProviderUnavailableError } from '../src/rates/errors.js';
import type { RatesProvider } from '../src/rates/types.js';
import type { ConvertResponse } from '../src/schemas.js';
import type { ApiErrorBody } from '../src/lib/types.js';

const RATE = 0.86123456;
const RATE_TIMESTAMP = '2026-06-12T10:00:00.000Z';

/**
 * @name createProviderStub
 *
 * @description Test stub of the rates provider injected through the buildApp DI seam (rule 1).
 *
 * @param {number} rate the rate the stub serves
 *
 * @returns {RatesProvider} the stubbed provider
 */
const createProviderStub = (rate: number): RatesProvider => ({
	getRate: async () => ({ rate, rateTimestamp: RATE_TIMESTAMP }),
	getSupportedCurrencies: async () => ['EUR', 'GBP', 'USD', 'JPY'],
	getCurrencies: async () => ({ EUR: 'Euro', GBP: 'British Pound', USD: 'US Dollar' }),
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
let failingApp: FastifyInstance;

beforeAll(async () => {
	app = await buildApp({ ratesProvider: createProviderStub(RATE) });
	const failingProvider: RatesProvider = {
		...createProviderStub(RATE),
		getSupportedCurrencies: async () => {
			throw new RateProviderUnavailableError(new Error('upstream down'));
		},
	};
	failingApp = await buildApp({ ratesProvider: failingProvider });
	await app.ready();
	await failingApp.ready();
});

afterAll(async () => {
	await app.close();
	await failingApp.close();
});

describe('POST /api/convert — the happy path', () => {
	it('converts with the full-precision rate, the rounded result and the §3 rateTimestamp', async () => {
		const response = await postConvert(app, { amount: 100, from: 'EUR', to: 'GBP' });

		expect(response.statusCode).toBe(200);
		expect(response.json<ConvertResponse>()).toEqual({
			amount: 100,
			from: 'EUR',
			to: 'GBP',
			rate: RATE,
			result: 86.12,
			rateTimestamp: RATE_TIMESTAMP,
		});
	});

	it('accepts lowercase codes and answers with UPPERCASE', async () => {
		const response = await postConvert(app, { amount: 1, from: 'eur', to: 'gbp' });

		expect(response.statusCode).toBe(200);
		const body = response.json<ConvertResponse>();
		expect(body.from).toBe('EUR');
		expect(body.to).toBe('GBP');
	});

	it('rounds a tiny result to the honest 0.00 — the resolved open question', async () => {
		const tinyApp = await buildApp({ ratesProvider: createProviderStub(0.00001) });
		const response = await postConvert(tinyApp, { amount: 0.01, from: 'EUR', to: 'JPY' });

		expect(response.statusCode).toBe(200);
		expect(response.json<ConvertResponse>().result).toBe(0);
		await tinyApp.close();
	});
});

describe('POST /api/convert — the validation catalog (every key)', () => {
	const expectValidationError = async (payload: unknown, expectedKey: string) => {
		const response = await postConvert(app, payload);

		expect(response.statusCode).toBe(400);
		const body = response.json<ApiErrorBody>();
		expect(body.error.code).toBe('VALIDATION_ERROR');
		expect(body.error.key).toBe(expectedKey);
	};

	it('amount = 0 → amountNotPositive', async () => {
		await expectValidationError(
			{ amount: 0, from: 'EUR', to: 'GBP' },
			'errors.validation.amountNotPositive',
		);
	});

	it('a negative amount → amountNotPositive', async () => {
		await expectValidationError(
			{ amount: -5, from: 'EUR', to: 'GBP' },
			'errors.validation.amountNotPositive',
		);
	});

	it('an amount over 1e12 → amountTooLarge', async () => {
		await expectValidationError(
			{ amount: 2e12, from: 'EUR', to: 'GBP' },
			'errors.validation.amountTooLarge',
		);
	});

	it('three decimal places → amountTooManyDecimals', async () => {
		await expectValidationError(
			{ amount: 1.005, from: 'EUR', to: 'GBP' },
			'errors.validation.amountTooManyDecimals',
		);
	});

	it('a malformed currency code → invalidCurrencyCode (the regex, not just the length)', async () => {
		await expectValidationError(
			{ amount: 1, from: 'EU1', to: 'GBP' },
			'errors.validation.invalidCurrencyCode',
		);
	});

	it('eur → EUR is the SAME currency after normalization → sameCurrency', async () => {
		await expectValidationError(
			{ amount: 1, from: 'eur', to: 'EUR' },
			'errors.validation.sameCurrency',
		);
	});

	it('a missing field falls back to the generic invalidRequest key', async () => {
		await expectValidationError({ from: 'EUR', to: 'GBP' }, 'errors.validation.invalidRequest');
	});
});

describe('POST /api/convert — the business and upstream errors', () => {
	it('an unsupported currency → 422 UNSUPPORTED_CURRENCY with params.code and the interpolated message', async () => {
		const response = await postConvert(app, { amount: 1, from: 'EUR', to: 'XYZ' });

		expect(response.statusCode).toBe(422);
		const body = response.json<ApiErrorBody>();
		expect(body.error.code).toBe('UNSUPPORTED_CURRENCY');
		expect(body.error.key).toBe('errors.unsupportedCurrency');
		expect(body.error.message).toBe('Currency XYZ is not supported');
		expect(body.error.params).toEqual({ code: 'XYZ' });
	});

	it('an unavailable provider → 502 RATE_PROVIDER_ERROR', async () => {
		const response = await postConvert(failingApp, { amount: 1, from: 'EUR', to: 'GBP' });

		expect(response.statusCode).toBe(502);
		expect(response.json<ApiErrorBody>().error.code).toBe('RATE_PROVIDER_ERROR');
	});

	it('is documented in the OpenAPI specification', async () => {
		const response = await app.inject({ method: 'GET', url: '/docs/json' });

		const document = response.json<{ paths: Record<string, unknown> }>();
		expect(document.paths['/api/convert']).toBeDefined();
	});
});
