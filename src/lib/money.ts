// Below this magnitude Number.toString() switches to exponential notation — and everything
// this small half-up-rounds to 0 anyway (the honest-zero decision, prompt v0.5.0)
const EXPONENTIAL_LOWER_BOUND = 1e-6;

/**
 * @name roundMoney
 *
 * @description The ONLY place money is rounded (rule 4, proposal §5): half-up to 2 decimal
 * places. The cents are built from the DECIMAL STRING of the value (integer part × 100 + the
 * first two fraction digits as BigInt; the third fraction digit ≥ 5 adds one cent) — never
 * from float multiplication: the naive Math.round(x * 100) / 100 fails on 1.005 × 100 =
 * 100.4999…. A whole number has no decimal point in toString() — the missing fraction part is
 * treated as empty and the value passes through unchanged. Values below 1e-6 (where toString()
 * goes exponential) round to the honest 0; larger exponential and non-finite inputs throw
 * (rule 24 — the validation bounds make them unreachable).
 *
 * @param {number} value the non-negative amount to round
 *
 * @returns {number} the value rounded half-up to 2 decimal places
 *
 * @throws {Error} on a negative, non-finite or out-of-range exponential input
 */
export const roundMoney = (value: number): number => {
	if (!Number.isFinite(value)) {
		throw new Error('roundMoney requires a finite number');
	}
	if (value < 0) {
		throw new Error('roundMoney requires a non-negative number');
	}
	if (value < EXPONENTIAL_LOWER_BOUND) {
		return 0;
	}
	const text = value.toString();
	if (text.includes('e') || text.includes('E')) {
		throw new Error('roundMoney does not support exponential notation');
	}
	const parts = text.split('.');
	const integerPart = parts[0] ?? '0';
	const fractionPart = parts[1] ?? '';

	let cents = BigInt(integerPart) * 100n + BigInt(`${fractionPart}00`.slice(0, 2));
	const thirdFractionDigit = fractionPart[2];
	if (thirdFractionDigit !== undefined && Number(thirdFractionDigit) >= 5) {
		cents += 1n;
	}
	return Number(cents) / 100;
};
