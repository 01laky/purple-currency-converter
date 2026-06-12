// The format is FIXED literally per Figma (§10, revised at 0.9.0): a REGULAR SPACE (U+0020)
// between thousands groups, a comma before exactly 2 decimals, the currency code after the
// amount. A custom deterministic implementation — NOT Intl.NumberFormat: ICU's cs-CZ grouping
// separator is U+00A0/U+202F (never the plain space the design shows) and CLDR drift across
// runtimes changes separators silently. Independent of every locale, ICU build and runtime.

const THOUSANDS_PATTERN = /\B(?=(\d{3})+(?!\d))/g;

/**
 * @name groupThousands
 *
 * @description Inserts a regular space (U+0020) between thousands groups of a digit string.
 *
 * @param {string} digits the integer digits
 *
 * @returns {string} the grouped digits
 */
const groupThousands = (digits: string): string => digits.replace(THOUSANDS_PATTERN, ' ');

/**
 * @name formatMoney
 *
 * @description Formats a monetary value per the Figma literal: `4 942,52 CZK`. The value
 * arrives already rounded by the API (§5 — the frontend NEVER rounds); toFixed(2) only pads.
 *
 * @param {number} value the API-rounded amount
 * @param {string} currencyCode the uppercase currency code
 *
 * @returns {string} the formatted amount with the code
 */
export const formatMoney = (value: number, currencyCode: string): string => {
	const [integerPart, fractionPart = '00'] = value.toFixed(2).split('.');
	return `${groupThousands(integerPart ?? '0')},${fractionPart} ${currencyCode}`;
};

/**
 * @name formatCount
 *
 * @description Formats a whole count with the same fixed grouping, no decimals.
 *
 * @param {number} value the count
 *
 * @returns {string} the grouped count
 */
export const formatCount = (value: number): string => groupThousands(Math.trunc(value).toString());
