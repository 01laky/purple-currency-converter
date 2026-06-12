import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../src/api/errors';
import { errorPlacement } from '../../../src/features/converter/ConverterForm/errorPlacement';

/**
 * @name makeError
 *
 * @description Test helper — an ApiError with the given code and key.
 *
 * @param {string} code the error code
 * @param {string} key the i18n key
 *
 * @returns {ApiError} the error
 */
const makeError = (code: string, key: string): ApiError => new ApiError(code, key, key);

describe('errorPlacement — the two-level mapping (the code is the family, the key is the address)', () => {
	it('parks the amount keys at the amount field', () => {
		expect(
			errorPlacement(makeError('VALIDATION_ERROR', 'errors.validation.amountNotPositive')),
		).toBe('amount');
		expect(
			errorPlacement(makeError('VALIDATION_ERROR', 'errors.validation.amountTooManyDecimals')),
		).toBe('amount');
	});

	it('parks sameCurrency and invalidCurrencyCode at the selects — NOT at the amount field', () => {
		expect(errorPlacement(makeError('VALIDATION_ERROR', 'errors.validation.sameCurrency'))).toBe(
			'selects',
		);
		expect(
			errorPlacement(makeError('VALIDATION_ERROR', 'errors.validation.invalidCurrencyCode')),
		).toBe('selects');
	});

	it('parks the generic invalidRequest at the form', () => {
		expect(errorPlacement(makeError('VALIDATION_ERROR', 'errors.validation.invalidRequest'))).toBe(
			'form',
		);
	});

	it('parks the 422 at the selects', () => {
		expect(errorPlacement(makeError('UNSUPPORTED_CURRENCY', 'errors.unsupportedCurrency'))).toBe(
			'selects',
		);
	});

	it('parks the upstream failures as the banner', () => {
		expect(errorPlacement(makeError('RATE_PROVIDER_ERROR', 'errors.rateProvider'))).toBe('banner');
		expect(errorPlacement(makeError('NETWORK_ERROR', 'errors.network'))).toBe('banner');
		expect(errorPlacement(makeError('INTERNAL_ERROR', 'errors.internal'))).toBe('banner');
	});

	// additive at v0.11.0: the api 429 needs ZERO frontend code — the two-level mapping already
	// routes every non-validation, non-422 code to the banner, and the catalog carries the text
	it('parks the 429 rate limit at the banner', () => {
		expect(errorPlacement(makeError('RATE_LIMITED', 'errors.rateLimited'))).toBe('banner');
	});

	// additive at v0.11.0 (the edge-case pass): the default branch is the forward-compatibility
	// contract — a code this frontend has never heard of must land at the banner, never crash
	it('parks an UNKNOWN future code at the banner — the default branch is the contract', () => {
		expect(errorPlacement(makeError('SOME_FUTURE_CODE', 'errors.someFuture'))).toBe('banner');
	});

	it('parks an unknown VALIDATION key at the form — the family default of the first level', () => {
		expect(errorPlacement(makeError('VALIDATION_ERROR', 'errors.validation.someFutureKey'))).toBe(
			'form',
		);
	});
});
