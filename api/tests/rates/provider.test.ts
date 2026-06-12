import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnvVar } from '../../src/lib/enums.js';
import { RATES_TTL_MS } from '../../src/rates/constants.js';
import { RateProviderUnavailableError, UnknownRateCurrencyError } from '../../src/rates/errors.js';
import { createRatesProvider } from '../../src/rates/provider.js';

const FIXTURE = { rates: { USD: 1, EUR: 0.9, GBP: 0.8, CZK: 23.5 }, timestamp: 1_700_000_000 };

let originalKey: string | undefined;

beforeEach(() => {
	originalKey = process.env[EnvVar.OER_API_KEY];
	process.env[EnvVar.OER_API_KEY] = 'test-key';
});

afterEach(() => {
	if (originalKey === undefined) {
		delete process.env[EnvVar.OER_API_KEY];
	} else {
		process.env[EnvVar.OER_API_KEY] = originalKey;
	}
});

/**
 * @name createHarness
 *
 * @description Test harness — a provider over a fake clock and a stubbed OER fetch (rule 1).
 *
 * @param {() => Promise<Response>} fetchImpl the fetch behavior of the test case
 *
 * @returns {{ provider: ReturnType<typeof createRatesProvider>, fetchFn: ReturnType<typeof vi.fn>, tick: (ms: number) => void }} the harness
 */
const createHarness = (fetchImpl: () => Promise<Response>) => {
	let time = 0;
	const fetchFn = vi.fn(fetchImpl);
	const provider = createRatesProvider({
		now: () => time,
		client: { fetchFn },
	});
	return {
		provider,
		fetchFn,
		tick: (ms: number): void => {
			time += ms;
		},
	};
};

/**
 * @name fixtureResponse
 *
 * @description Test helper — a fresh 200 Response with the rates fixture.
 *
 * @returns {Response} the response object
 */
const fixtureResponse = (): Response =>
	new Response(JSON.stringify(FIXTURE), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});

describe('createRatesProvider', () => {
	it('computes the cross-rate through USD: EUR→GBP = USDGBP / USDEUR', async () => {
		const { provider } = createHarness(async () => fixtureResponse());

		const quote = await provider.getRate('EUR', 'GBP');

		expect(quote.rate).toBe(FIXTURE.rates.GBP / FIXTURE.rates.EUR);
		expect(quote.rateTimestamp).toBe(new Date(0).toISOString());
	});

	it('USD→X and X→USD follow the same formula', async () => {
		const { provider } = createHarness(async () => fixtureResponse());

		expect((await provider.getRate('USD', 'EUR')).rate).toBe(FIXTURE.rates.EUR);
		expect((await provider.getRate('EUR', 'USD')).rate).toBe(1 / FIXTURE.rates.EUR);
	});

	it('throws UnknownRateCurrencyError for a currency missing from the rates — never NaN', async () => {
		const { provider } = createHarness(async () => fixtureResponse());

		await expect(provider.getRate('EUR', 'XYZ')).rejects.toThrowError(UnknownRateCurrencyError);
	});

	it('keeps the ORIGINAL rateTimestamp under the stale fallback', async () => {
		let shouldFail = false;
		const { provider, tick } = createHarness(async () => {
			if (shouldFail) {
				throw new Error('upstream down');
			}
			return fixtureResponse();
		});

		const fresh = await provider.getRate('EUR', 'GBP');
		shouldFail = true;
		tick(RATES_TTL_MS + 1);
		const stale = await provider.getRate('EUR', 'GBP');

		expect(stale.rate).toBe(fresh.rate);
		expect(stale.rateTimestamp).toBe(fresh.rateTimestamp);
	});

	// additive at v0.11.0 (the adversarial pass): the stale fallback warns through the injected
	// logger — an OER outage is visible in the logs while the cache still answers (rule 24)
	it('logs a warn line when the stale copy is served — the outage is never silent', async () => {
		let time = 0;
		let shouldFail = false;
		const warn = vi.fn();
		const provider = createRatesProvider({
			now: () => time,
			client: {
				fetchFn: vi.fn(async () => {
					if (shouldFail) {
						throw new Error('upstream down');
					}
					return fixtureResponse();
				}),
			},
			logger: { warn },
		});

		await provider.getRate('EUR', 'GBP');
		expect(warn).not.toHaveBeenCalled();
		shouldFail = true;
		time += RATES_TTL_MS + 1;
		await provider.getRate('EUR', 'GBP');

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith(
			{ err: expect.any(Error) },
			'rates refresh failed — serving the stale copy',
		);
	});

	it('throws RateProviderUnavailableError when the fetch fails with nothing cached', async () => {
		const { provider } = createHarness(async () => {
			throw new Error('upstream down');
		});

		await expect(provider.getRate('EUR', 'GBP')).rejects.toThrowError(RateProviderUnavailableError);
	});

	it('lists the supported currencies as the keys of the cached rates', async () => {
		const { provider } = createHarness(async () => fixtureResponse());

		expect(await provider.getSupportedCurrencies()).toEqual(Object.keys(FIXTURE.rates));
	});

	it('reports the cache age: null before the first fetch, whole seconds after it', async () => {
		const { provider, tick } = createHarness(async () => fixtureResponse());

		expect(provider.getCacheAgeSeconds()).toBeNull();
		await provider.getRate('EUR', 'GBP');
		expect(provider.getCacheAgeSeconds()).toBe(0);
		tick(7_000);
		expect(provider.getCacheAgeSeconds()).toBe(7);
	});
});
