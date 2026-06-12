import { describe, expect, it, vi } from 'vitest';
import { toEurCents } from '../../src/stats/eur.js';
import type { RatesProvider } from '../../src/rates/types.js';

/**
 * @name createProviderStub
 *
 * @description Test stub of the rates provider with a spy-able getRate (rule 1).
 *
 * @param {number} rate the from→EUR rate the stub serves
 *
 * @returns {{ provider: RatesProvider, getRate: ReturnType<typeof vi.fn> }} the stub and the spy
 */
const createProviderStub = (rate: number) => {
	const getRate = vi.fn(async () => ({ rate, rateTimestamp: '2026-06-12T10:00:00.000Z' }));
	const provider: RatesProvider = {
		getRate,
		getSupportedCurrencies: async () => ['EUR', 'GBP', 'USD'],
		getCurrencies: async () => ({ EUR: 'Euro' }),
		getCacheAgeSeconds: () => 0,
	};
	return { provider, getRate };
};

describe('toEurCents', () => {
	it('from = EUR returns Math.round(amount × 100): 100.50 EUR → 10050 cents, never 100.5', async () => {
		const { provider, getRate } = createProviderStub(999);

		expect(await toEurCents(100.5, 'EUR', provider)).toBe(10050);
		expect(getRate).not.toHaveBeenCalled();
	});

	it('from = EUR keeps integers integral (86.12 → 8612 — the representation error absorbed)', async () => {
		const { provider } = createProviderStub(999);

		const cents = await toEurCents(86.12, 'EUR', provider);

		expect(cents).toBe(8612);
		expect(Number.isInteger(cents)).toBe(true);
	});

	it('a cross conversion uses rate(from→EUR) and returns integer cents', async () => {
		const { provider, getRate } = createProviderStub(1.17);

		const cents = await toEurCents(100, 'GBP', provider);

		expect(getRate).toHaveBeenCalledWith('GBP', 'EUR');
		expect(cents).toBe(11700);
		expect(Number.isInteger(cents)).toBe(true);
	});

	it('a cross conversion rounds once through roundMoney before the cents', async () => {
		// 100 × 0.861234 = 86.1234 → roundMoney → 86.12 → 8612 cents
		const { provider } = createProviderStub(0.861234);

		expect(await toEurCents(100, 'GBP', provider)).toBe(8612);
	});
});
