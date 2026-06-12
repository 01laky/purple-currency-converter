import { z } from 'zod';
import { EnvVar } from '../lib/enums.js';
import { CURRENCY_NAMES_URL, FETCH_TIMEOUT_MS, OER_LATEST_URL } from './constants.js';
import type { CurrencyNames, OerClientDeps, OerLatestRates } from './types.js';

// The shape of the external response is never assumed (rule 3); extra fields are ignored
const oerLatestSchema = z.object({
	rates: z.record(z.string(), z.number()),
	timestamp: z.number(),
});

const currencyNamesSchema = z.record(z.string(), z.string());

/**
 * @name fetchOerResource
 *
 * @description The single OER fetch pattern (proposal §4): the key from the env, an injectable
 * fetch function and timeout (rule 1), an AbortController abort after the timeout (5 s — under
 * the 10 s Lambda budget, §8) and Zod parsing of the response (rule 3). The app_id never
 * appears in errors or logs — URLs are logged without the query string (§4).
 *
 * @param {string} url the OER endpoint URL without the query string
 * @param {z.ZodType<T>} schema the schema the response must satisfy
 * @param {OerClientDeps} deps optional fetch function and timeout override
 *
 * @returns {Promise<T>} the parsed response
 *
 * @throws {Error} when OER_API_KEY is not set, the request fails, times out or has a wrong shape
 */
const fetchOerResource = async <T>(
	url: string,
	schema: z.ZodType<T>,
	deps?: OerClientDeps,
): Promise<T> => {
	const apiKey = process.env[EnvVar.OER_API_KEY];
	if (apiKey === undefined || apiKey === '') {
		throw new Error('OER_API_KEY env variable is not set');
	}
	const fetchFn = deps?.fetchFn ?? globalThis.fetch;
	const timeoutMs = deps?.timeoutMs ?? FETCH_TIMEOUT_MS;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchFn(`${url}?app_id=${apiKey}`, {
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new Error(`Rate provider request failed with status ${String(response.status)}`);
		}
		return schema.parse(await response.json());
	} finally {
		clearTimeout(timer);
	}
};

/**
 * @name fetchLatestRates
 *
 * @description Fetches the latest USD-base rates from openexchangerates (proposal §4) through
 * the single OER fetch pattern.
 *
 * @param {OerClientDeps} deps optional fetch function and timeout override
 *
 * @returns {Promise<OerLatestRates>} the parsed rates and the OER timestamp
 *
 * @throws {Error} when OER_API_KEY is not set, the request fails, times out or has a wrong shape
 */
export const fetchLatestRates = async (deps?: OerClientDeps): Promise<OerLatestRates> =>
	fetchOerResource(OER_LATEST_URL, oerLatestSchema, deps);

/**
 * @name fetchCurrencyNames
 *
 * @description Fetches the currency display names from openexchangerates (proposal §3 — the
 * source of /api/currencies) through the single OER fetch pattern.
 *
 * @param {OerClientDeps} deps optional fetch function and timeout override
 *
 * @returns {Promise<CurrencyNames>} the codes to display names map
 *
 * @throws {Error} when OER_API_KEY is not set, the request fails, times out or has a wrong shape
 */
export const fetchCurrencyNames = async (deps?: OerClientDeps): Promise<CurrencyNames> =>
	fetchOerResource(CURRENCY_NAMES_URL, currencyNamesSchema, deps);
