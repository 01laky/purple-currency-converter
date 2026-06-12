import { roundMoney } from '../lib/money.js';
import type { RatesProvider } from '../rates/types.js';
import { UnsupportedCurrencyError } from './errors.js';
import type { ConvertInput, ConvertResult } from './types.js';

/**
 * @name convertAmount
 *
 * @description The conversion of proposal §3/§5: ① both currencies are validated against the
 * ACTUAL supported list — the keys of the cached rates (rule 5); ② the cross-rate comes in
 * full precision; ③ the computation runs in a number and the result is rounded ONCE at the end
 * via roundMoney (rule 4). rateTimestamp passes through from the provider (the §3 semantics —
 * the time the rates were fetched, not the conversion moment).
 *
 * @param {ConvertInput} input the validated amount and the normalized currency codes
 * @param {RatesProvider} ratesProvider the provider serving the rates
 *
 * @returns {Promise<ConvertResult>} the conversion echo, the full-precision rate, the rounded result and the rate timestamp
 *
 * @throws {UnsupportedCurrencyError} when either currency is not in the supported list
 * @throws {RateProviderUnavailableError} when the provider can serve nothing at all
 */
export const convertAmount = async (
	input: ConvertInput,
	ratesProvider: RatesProvider,
): Promise<ConvertResult> => {
	const supported = await ratesProvider.getSupportedCurrencies();
	for (const code of [input.from, input.to]) {
		if (!supported.includes(code)) {
			throw new UnsupportedCurrencyError(code);
		}
	}
	const { rate, rateTimestamp } = await ratesProvider.getRate(input.from, input.to);
	return {
		amount: input.amount,
		from: input.from,
		to: input.to,
		rate,
		result: roundMoney(input.amount * rate),
		rateTimestamp,
	};
};
