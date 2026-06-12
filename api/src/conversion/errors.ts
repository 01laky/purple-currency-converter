/**
 * @name UnsupportedCurrencyError
 *
 * @description Thrown when a requested currency is not in the supported list — the keys of the
 * cached rates (rule 5, proposal §4). Mapped to 422 UNSUPPORTED_CURRENCY with params.code by
 * the central error handler. Distinct from the provider's defensive UnknownRateCurrencyError:
 * this one answers "is this currency offered?" and is the user-facing path; the provider error
 * is unreachable for user input by design (the same cached payload backs both checks) and
 * would surface as 500.
 */
export class UnsupportedCurrencyError extends Error {
	readonly code: string;

	/**
	 * @name constructor
	 *
	 * @description Creates the error for the given currency code.
	 *
	 * @param {string} code the unsupported currency code
	 *
	 * @returns {UnsupportedCurrencyError} the error instance
	 */
	constructor(code: string) {
		super(`Currency ${code} is not supported`);
		this.name = 'UnsupportedCurrencyError';
		this.code = code;
	}
}
