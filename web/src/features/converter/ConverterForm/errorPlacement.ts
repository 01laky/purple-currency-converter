import type { ApiError } from '../../../api/errors';

export type ErrorPlacement = 'amount' | 'selects' | 'form' | 'banner';

const AMOUNT_KEY_PREFIX = 'errors.validation.amount';

const SELECT_KEYS = ['errors.validation.sameCurrency', 'errors.validation.invalidCurrencyCode'];

/**
 * @name errorPlacement
 *
 * @description The §10 TWO-LEVEL error mapping (prompt v0.10.0): the code picks the family,
 * the KEY picks the placement — VALIDATION_ERROR alone cannot decide between the amount field
 * and the selects (sameCurrency belongs at the selects, not at the amount input). The
 * placement: the amount keys at the field, the currency keys and the 422 at the selects, the
 * generic invalidRequest at the form, everything upstream (the provider, the network) as the
 * page-level banner.
 *
 * @param {ApiError} error the typed API error
 *
 * @returns {ErrorPlacement} where the error renders
 */
export const errorPlacement = (error: ApiError): ErrorPlacement => {
	if (error.code === 'VALIDATION_ERROR') {
		if (error.key.startsWith(AMOUNT_KEY_PREFIX)) {
			return 'amount';
		}
		if (SELECT_KEYS.includes(error.key)) {
			return 'selects';
		}
		return 'form';
	}
	if (error.code === 'UNSUPPORTED_CURRENCY') {
		return 'selects';
	}
	return 'banner';
};
