import { createCachedSource } from './cached-source.js';
import { fetchCurrencyNames, fetchLatestRates } from './client.js';
import { NAMES_TTL_MS, RATES_TTL_MS } from './constants.js';
import { RateProviderUnavailableError, UnknownRateCurrencyError } from './errors.js';
import type {
	CachedSource,
	CachedValue,
	CurrencyNames,
	OerLatestRates,
	RatesProvider,
	RatesProviderDeps,
} from './types.js';

/**
 * @name resolveUsdRate
 *
 * @description Reads the USD rate of a currency from the rates map; a missing currency throws
 * instead of producing a silent NaN division (proposal §4).
 *
 * @param {Record<string, number>} rates the USD-base rates map
 * @param {string} code the currency code to resolve
 *
 * @returns {number} the USD rate of the currency
 *
 * @throws {UnknownRateCurrencyError} when the currency is not present in the rates
 */
const resolveUsdRate = (rates: Record<string, number>, code: string): number => {
	const rate = rates[code];
	if (rate === undefined) {
		throw new UnknownRateCurrencyError(code);
	}
	return rate;
};

/**
 * @name createRatesProvider
 *
 * @description The cross-rate provider of proposal §4: wraps the OER client in the generic
 * 10-minute cache and computes every pair through the USD base (the free plan serves no other).
 * The clock and the client dependencies are injectable for deterministic tests (rule 1).
 *
 * @param {RatesProviderDeps} deps optional clock and client overrides
 *
 * @returns {RatesProvider} getRate, getSupportedCurrencies and getCacheAgeSeconds
 */
export const createRatesProvider = (deps?: RatesProviderDeps): RatesProvider => {
	const now = deps?.now ?? Date.now;
	const source = createCachedSource<OerLatestRates>({
		fetchFn: () => fetchLatestRates(deps?.client),
		ttlMs: RATES_TTL_MS,
		now,
	});
	const namesSource = createCachedSource<CurrencyNames>({
		fetchFn: () => fetchCurrencyNames(deps?.client),
		ttlMs: NAMES_TTL_MS,
		now,
	});

	/**
	 * @name getFromSource
	 *
	 * @description Reads a cached source; a completely unavailable upstream (failed fetch, no
	 * stale copy) surfaces as RateProviderUnavailableError — the 502 of the error model.
	 *
	 * @param {CachedSource<T>} cachedSource the source to read
	 *
	 * @returns {Promise<CachedValue<T>>} the cached payload
	 *
	 * @throws {RateProviderUnavailableError} when nothing can be served at all
	 */
	const getFromSource = async <T>(cachedSource: CachedSource<T>): Promise<CachedValue<T>> => {
		try {
			return await cachedSource.get();
		} catch (error) {
			throw new RateProviderUnavailableError(error);
		}
	};

	/**
	 * @name getRates
	 *
	 * @description Returns the cached rates payload.
	 *
	 * @returns {Promise<CachedValue<OerLatestRates>>} the cached rates payload
	 *
	 * @throws {RateProviderUnavailableError} when no rates can be served at all
	 */
	const getRates = async (): Promise<CachedValue<OerLatestRates>> => getFromSource(source);

	/**
	 * @name getRate
	 *
	 * @description The cross-rate of a pair through USD: rate(from→to) = usdRates[to] /
	 * usdRates[from], in full precision (§3 — rounding never happens here). rateTimestamp is
	 * the moment the cached payload was fetched from OER (ISO 8601 UTC) — honestly older under
	 * the stale fallback.
	 *
	 * @param {string} from the source currency code
	 * @param {string} to the target currency code
	 *
	 * @returns {Promise<RateQuote>} the rate and its timestamp
	 *
	 * @throws {UnknownRateCurrencyError} when either currency is missing from the rates
	 * @throws {RateProviderUnavailableError} when no rates can be served at all
	 */
	const getRate = async (from: string, to: string) => {
		const { value, fetchedAt } = await getRates();
		const rate = resolveUsdRate(value.rates, to) / resolveUsdRate(value.rates, from);
		return { rate, rateTimestamp: new Date(fetchedAt).toISOString() };
	};

	/**
	 * @name getSupportedCurrencies
	 *
	 * @description The supported-currency list = the keys of the cached rates (§4) — the source
	 * for the rule 5 validation at v0.5.0.
	 *
	 * @returns {Promise<string[]>} the supported currency codes
	 *
	 * @throws {RateProviderUnavailableError} when no rates can be served at all
	 */
	const getSupportedCurrencies = async (): Promise<string[]> =>
		Object.keys((await getRates()).value.rates);

	/**
	 * @name getCurrencies
	 *
	 * @description The /api/currencies source (proposal §3): the INTERSECTION of the OER
	 * currency names and the cached rates — only currencies that have a rate are returned, so
	 * the list and the rates never diverge. Keys come sorted (deterministic responses). Both
	 * sources keep their independent stale fallbacks.
	 *
	 * @returns {Promise<CurrencyNames>} the codes to display names map, sorted by code
	 *
	 * @throws {RateProviderUnavailableError} when either source can serve nothing at all
	 */
	const getCurrencies = async (): Promise<CurrencyNames> => {
		const [names, rates] = await Promise.all([getFromSource(namesSource), getRates()]);
		const currencies: CurrencyNames = {};
		for (const code of Object.keys(names.value).sort()) {
			const name = names.value[code];
			if (name !== undefined && rates.value.rates[code] !== undefined) {
				currencies[code] = name;
			}
		}
		return currencies;
	};

	return { getRate, getSupportedCurrencies, getCurrencies, getCacheAgeSeconds: source.ageSeconds };
};
