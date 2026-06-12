import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fetchCurrencyNames } from '../../src/rates/client.js';
import { NAMES_TTL_MS } from '../../src/rates/constants.js';
import { RateProviderUnavailableError } from '../../src/rates/errors.js';
import { createRatesProvider } from '../../src/rates/provider.js';
import { EnvVar } from '../../src/lib/enums.js';
import type { FetchFn } from '../../src/rates/types.js';

const RATES_FIXTURE = {
	rates: { USD: 1, EUR: 0.9, GBP: 0.8, CZK: 23.5 },
	timestamp: 1_700_000_000,
};
const NAMES_FIXTURE = {
	XYZ: 'Imaginary Money',
	EUR: 'Euro',
	USD: 'US Dollar',
	GBP: 'British Pound',
};

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
 * @name jsonResponse
 *
 * @description Test helper — a 200 Response carrying the given body as JSON.
 *
 * @param {unknown} body the payload to serve
 *
 * @returns {Response} the response object
 */
const jsonResponse = (body: unknown): Response =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});

/**
 * @name createHarness
 *
 * @description Test harness — a provider over a fake clock and a URL-routing OER stub
 * (rule 1): /currencies.json requests get the names behavior, everything else the rates.
 *
 * @param {{ names?: () => Promise<Response>, rates?: () => Promise<Response> }} behaviors per-endpoint overrides
 *
 * @returns {{ provider: ReturnType<typeof createRatesProvider>, tick: (ms: number) => void }} the harness
 */
const createHarness = (behaviors?: {
	names?: () => Promise<Response>;
	rates?: () => Promise<Response>;
}) => {
	let time = 0;
	const fetchFn: FetchFn = async (input) => {
		if (String(input).includes('currencies.json')) {
			return behaviors?.names === undefined ? jsonResponse(NAMES_FIXTURE) : behaviors.names();
		}
		return behaviors?.rates === undefined ? jsonResponse(RATES_FIXTURE) : behaviors.rates();
	};
	const provider = createRatesProvider({ now: () => time, client: { fetchFn } });
	return {
		provider,
		tick: (ms: number): void => {
			time += ms;
		},
	};
};

describe('fetchCurrencyNames', () => {
	it('parses a valid /currencies.json response', async () => {
		const fetchFn: FetchFn = async () => jsonResponse(NAMES_FIXTURE);

		expect(await fetchCurrencyNames({ fetchFn })).toEqual(NAMES_FIXTURE);
	});

	it('rejects a response with non-string values (rule 3 — never assume)', async () => {
		const fetchFn: FetchFn = async () => jsonResponse({ EUR: 1 });

		await expect(fetchCurrencyNames({ fetchFn })).rejects.toThrowError(z.ZodError);
	});
});

describe('getCurrencies', () => {
	it('returns the INTERSECTION: a name without a rate and a rate without a name are dropped', async () => {
		const { provider } = createHarness();

		const currencies = await provider.getCurrencies();

		// XYZ has a name but no rate; CZK has a rate but no name — both excluded
		expect(currencies).toEqual({ EUR: 'Euro', GBP: 'British Pound', USD: 'US Dollar' });
	});

	it('returns the keys sorted — deterministic responses', async () => {
		const { provider } = createHarness();

		expect(Object.keys(await provider.getCurrencies())).toEqual(['EUR', 'GBP', 'USD']);
	});

	it('serves the stale names when the names refresh fails', async () => {
		let namesFail = false;
		const { provider, tick } = createHarness({
			names: async () => {
				if (namesFail) {
					throw new Error('names down');
				}
				return jsonResponse(NAMES_FIXTURE);
			},
		});

		const fresh = await provider.getCurrencies();
		namesFail = true;
		tick(NAMES_TTL_MS + 1);
		const stale = await provider.getCurrencies();

		expect(stale).toEqual(fresh);
	});

	it('throws RateProviderUnavailableError when the names source can serve nothing at all', async () => {
		const { provider } = createHarness({
			names: async () => {
				throw new Error('names down');
			},
		});

		await expect(provider.getCurrencies()).rejects.toThrowError(RateProviderUnavailableError);
	});
});
