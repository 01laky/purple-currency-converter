import { describe, expect, it } from 'vitest';
import { UnsupportedCurrencyError } from '../../src/conversion/errors.js';
import { convertAmount } from '../../src/conversion/service.js';
import type { RatesProvider } from '../../src/rates/types.js';

const RATE = 0.86123456;
const RATE_TIMESTAMP = '2026-06-12T10:00:00.000Z';

/**
 * @name createProviderStub
 *
 * @description Test stub of the rates provider (rule 1 — no real OER anywhere near the
 * service tests).
 *
 * @param {number} rate the rate the stub serves
 *
 * @returns {RatesProvider} the stubbed provider
 */
const createProviderStub = (rate: number): RatesProvider => ({
	getRate: async () => ({ rate, rateTimestamp: RATE_TIMESTAMP }),
	getSupportedCurrencies: async () => ['EUR', 'GBP', 'USD'],
	getCurrencies: async () => ({ EUR: 'Euro', GBP: 'British Pound', USD: 'US Dollar' }),
	getCacheAgeSeconds: () => 0,
});

describe('convertAmount', () => {
	it('returns the full-precision rate and the once-rounded result', async () => {
		const conversion = await convertAmount(
			{ amount: 100, from: 'EUR', to: 'GBP' },
			createProviderStub(RATE),
		);

		expect(conversion).toEqual({
			amount: 100,
			from: 'EUR',
			to: 'GBP',
			rate: RATE,
			result: 86.12,
			rateTimestamp: RATE_TIMESTAMP,
		});
	});

	it('passes rateTimestamp through untouched — the §3 semantics belong to the provider', async () => {
		const conversion = await convertAmount(
			{ amount: 1, from: 'USD', to: 'EUR' },
			createProviderStub(RATE),
		);

		expect(conversion.rateTimestamp).toBe(RATE_TIMESTAMP);
	});

	it('throws UnsupportedCurrencyError for an unknown FROM currency', async () => {
		await expect(
			convertAmount({ amount: 1, from: 'XXX', to: 'EUR' }, createProviderStub(RATE)),
		).rejects.toThrowError(UnsupportedCurrencyError);
	});

	it('throws UnsupportedCurrencyError for an unknown TO currency, carrying the code', async () => {
		const failure = convertAmount({ amount: 1, from: 'EUR', to: 'ZZZ' }, createProviderStub(RATE));

		await expect(failure).rejects.toThrowError(UnsupportedCurrencyError);
		await expect(failure).rejects.toMatchObject({ code: 'ZZZ' });
	});

	it('rounds a tiny conversion to the honest 0.00 — the resolved open question', async () => {
		const conversion = await convertAmount(
			{ amount: 0.01, from: 'EUR', to: 'GBP' },
			createProviderStub(0.00001),
		);

		expect(conversion.result).toBe(0);
		expect(conversion.rate).toBe(0.00001);
	});
});
