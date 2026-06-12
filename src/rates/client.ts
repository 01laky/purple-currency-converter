import { z } from 'zod';
import { EnvVar } from '../lib/enums.js';
import { FETCH_TIMEOUT_MS, OER_LATEST_URL } from './constants.js';
import type { FetchLatestRatesDeps, OerLatestRates } from './types.js';

// The shape of the external response is never assumed (rule 3); extra fields are ignored
const oerLatestSchema = z.object({
	rates: z.record(z.string(), z.number()),
	timestamp: z.number(),
});

/**
 * @name fetchLatestRates
 *
 * @description Fetches the latest USD-base rates from openexchangerates (proposal §4). The
 * fetch function and the timeout are injectable — tests never call the real API (rule 1). The
 * request is aborted after the timeout (5 s — under the 10 s Lambda budget, §8) and the
 * response is parsed through a Zod schema (rule 3). The app_id never appears in errors or
 * logs — URLs are logged without the query string (§4).
 *
 * @param {FetchLatestRatesDeps} deps optional fetch function and timeout override
 *
 * @returns {Promise<OerLatestRates>} the parsed rates and the OER timestamp
 *
 * @throws {Error} when OER_API_KEY is not set, the request fails, times out or has a wrong shape
 */
export const fetchLatestRates = async (deps?: FetchLatestRatesDeps): Promise<OerLatestRates> => {
	const apiKey = process.env[EnvVar.OER_API_KEY];
	if (apiKey === undefined || apiKey === '') {
		throw new Error('OER_API_KEY env variable is not set');
	}
	const fetchFn = deps?.fetchFn ?? globalThis.fetch;
	const timeoutMs = deps?.timeoutMs ?? FETCH_TIMEOUT_MS;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchFn(`${OER_LATEST_URL}?app_id=${apiKey}`, {
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new Error(`Rate provider request failed with status ${String(response.status)}`);
		}
		return oerLatestSchema.parse(await response.json());
	} finally {
		clearTimeout(timer);
	}
};
