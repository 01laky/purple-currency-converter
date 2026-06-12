/**
 * @name RateProviderUnavailableError
 *
 * @description Thrown when the external rate provider cannot be reached AND no stale copy
 * exists in the cache (proposal §4) — the only situation the rates module cannot answer from.
 * Mapped to 502 RATE_PROVIDER_ERROR by the central error handler from v0.4.0.
 */
export class RateProviderUnavailableError extends Error {
	/**
	 * @name constructor
	 *
	 * @description Creates the error, keeping the original failure as the cause.
	 *
	 * @param {unknown} cause the underlying fetch/parse failure
	 *
	 * @returns {RateProviderUnavailableError} the error instance
	 */
	constructor(cause: unknown) {
		super('Exchange rate provider is unavailable', { cause });
		this.name = 'RateProviderUnavailableError';
	}
}

/**
 * @name UnknownRateCurrencyError
 *
 * @description Thrown when a requested currency is missing from the cached USD rates —
 * defensive guard against a silent NaN division (proposal §4). The polite 422 validation
 * against the supported list happens at the API layer (v0.5.0, rule 5).
 */
export class UnknownRateCurrencyError extends Error {
	readonly code: string;

	/**
	 * @name constructor
	 *
	 * @description Creates the error for the given currency code.
	 *
	 * @param {string} code the currency code missing from the rates
	 *
	 * @returns {UnknownRateCurrencyError} the error instance
	 */
	constructor(code: string) {
		super(`Currency ${code} is not present in the exchange rates`);
		this.name = 'UnknownRateCurrencyError';
		this.code = code;
	}
}
