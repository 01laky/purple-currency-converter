import type { CachedSource, CachedSourceOptions, CachedValue } from './types.js';

/**
 * @name createCachedSource
 *
 * @description The generic in-memory cache of proposal §4, shared by the rates (v0.3.0) and
 * the currency names (v0.4.0). Within the TTL it serves from memory; after expiry it refetches,
 * and concurrent callers share a single in-flight fetch — N waiting requests never fire N
 * upstream calls. A failed refresh serves the stale copy with its ORIGINAL fetchedAt and
 * stale: true; a failed fetch with nothing cached propagates (rule 24). The clock is an
 * injected dependency — the TTL/stale logic is deterministic under fake time.
 *
 * @param {CachedSourceOptions<T>} options the fetch function, the TTL and the clock
 *
 * @returns {CachedSource<T>} the cached source with get() and ageSeconds()
 */
export const createCachedSource = <T>(options: CachedSourceOptions<T>): CachedSource<T> => {
	const { fetchFn, ttlMs, now } = options;
	let cached: { value: T; fetchedAt: number } | undefined;
	let inFlight: Promise<CachedValue<T>> | undefined;

	/**
	 * @name refresh
	 *
	 * @description Fetches a fresh value; on failure falls back to the stale copy when one
	 * exists, otherwise rethrows.
	 *
	 * @returns {Promise<CachedValue<T>>} the fresh value, or the stale copy on a failed refresh
	 *
	 * @throws {Error} the fetch error when nothing was ever cached
	 */
	const refresh = async (): Promise<CachedValue<T>> => {
		try {
			const value = await fetchFn();
			cached = { value, fetchedAt: now() };
			return { ...cached, stale: false };
		} catch (error) {
			if (cached !== undefined) {
				// the stale fallback (§4): the last good copy, honestly with its original fetchedAt
				return { ...cached, stale: true };
			}
			throw error;
		} finally {
			inFlight = undefined;
		}
	};

	/**
	 * @name get
	 *
	 * @description Returns the cached value within the TTL, otherwise triggers (or joins) the
	 * single in-flight refresh.
	 *
	 * @returns {Promise<CachedValue<T>>} the cached or freshly fetched value
	 *
	 * @throws {Error} the fetch error when nothing was ever cached
	 */
	const get = async (): Promise<CachedValue<T>> => {
		if (cached !== undefined && now() - cached.fetchedAt < ttlMs) {
			return { ...cached, stale: false };
		}
		inFlight ??= refresh();
		return inFlight;
	};

	/**
	 * @name ageSeconds
	 *
	 * @description Age of the cached value in whole seconds; null before the first successful
	 * fetch (the /health semantics — proposal §3).
	 *
	 * @returns {number | null} the age in seconds, or null with an empty cache
	 */
	const ageSeconds = (): number | null =>
		cached === undefined ? null : Math.floor((now() - cached.fetchedAt) / 1000);

	return { get, ageSeconds };
};
