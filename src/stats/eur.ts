import { roundMoney } from '../lib/money.js';
import type { RatesProvider } from '../rates/types.js';
import { EUR_CURRENCY } from './constants.js';

/**
 * @name toEurCents
 *
 * @description Converts a conversion amount to EUR CENTS (an integer) at write time with the
 * rate valid at that moment (proposal §5). For from = EUR the cents come directly as
 * Math.round(amount × 100) — NO rate lookup; §5's "simply the amount" speaks about euros, this
 * function returns cents (100.50 EUR is 10050, never 100.5). For other currencies the amount
 * is converted through rate(from→EUR) — the same cached payload as the conversion itself, no
 * extra OER call — rounded once by roundMoney; the final Math.round(value × 100) only absorbs
 * the float representation error (≤ 1e-9 on a 2-dp value), far below the half-cent threshold.
 *
 * @param {number} amount the converted amount (validated, max 2 decimal places)
 * @param {string} from the source currency code (normalized to uppercase)
 * @param {RatesProvider} ratesProvider the provider serving the EUR rate
 *
 * @returns {Promise<number>} the amount as integer EUR cents
 *
 * @throws {Error} when the provider cannot serve the EUR rate (caught by the statistics step)
 */
export const toEurCents = async (
	amount: number,
	from: string,
	ratesProvider: RatesProvider,
): Promise<number> => {
	if (from === EUR_CURRENCY) {
		return Math.round(amount * 100);
	}
	const { rate } = await ratesProvider.getRate(from, EUR_CURRENCY);
	return Math.round(roundMoney(amount * rate) * 100);
};
