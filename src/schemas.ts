import { z } from 'zod';
import { LANGUAGES } from './i18n/constants.js';
import type { TranslationTree } from './i18n/types.js';
import { MAX_AMOUNT } from './lib/constants.js';
import { ErrorCode, ErrorKey } from './lib/enums.js';

export const healthResponseSchema = z.object({
	ok: z.literal(true).describe('Liveness flag — always true when the instance responds'),
	version: z.string().describe('The application version from package.json'),
	uptime: z.number().describe('Process uptime in seconds (per instance on Lambda)'),
	ratesCacheAge: z
		.number()
		.nullable()
		.describe(
			'Age of the rates cache in seconds; null before the first fetch (the cache exists from v0.3.0)',
		),
});

export const errorResponseSchema = z.object({
	error: z.object({
		code: z.enum(ErrorCode).describe('Programmatic error code'),
		key: z
			.string()
			.describe('i18n key for the frontend (translations arrive via GET /api/init in v0.2.0)'),
		message: z.string().describe('Human-readable message, always in English'),
		params: z
			.record(z.string(), z.union([z.string(), z.number()]))
			.optional()
			.describe('Interpolation values for the i18n key'),
	}),
});

const translationTreeSchema: z.ZodType<TranslationTree> = z.lazy(() =>
	z.record(z.string(), z.union([z.string(), translationTreeSchema])),
);

export const initResponseSchema = z.object({
	languages: z
		.array(z.enum(LANGUAGES))
		.describe('Supported language codes (ISO 639-1) — the frontend hardcodes nothing'),
	translations: z
		.record(z.string(), translationTreeSchema)
		.describe('The complete translation tree of every supported language'),
});

export const currenciesResponseSchema = z.object({
	currencies: z
		.record(z.string(), z.string())
		.describe(
			'Supported currency codes mapped to display names — the intersection with the cached rates: only currencies that have a rate are listed',
		),
});

/**
 * @name hasAtMostTwoDecimals
 *
 * @description Checks the 2-decimal-places bound on the DECIMAL STRING of the value (the
 * fraction-part length of toString()) — never via float arithmetic like value * 100 % 1, the
 * same §5 philosophy as roundMoney. Exponential notation (only reachable for extremes already
 * rejected by the other bounds) fails the check.
 *
 * @param {number} value the amount to check
 *
 * @returns {boolean} true when the value has at most 2 decimal places
 */
const hasAtMostTwoDecimals = (value: number): boolean => {
	const text = value.toString();
	if (text.includes('e') || text.includes('E')) {
		return false;
	}
	return (text.split('.')[1] ?? '').length <= 2;
};

// Validation messages ARE i18n keys (§3) — the central handler passes them through
const currencyCodeSchema = z
	.string()
	.regex(/^[A-Za-z]{3}$/, ErrorKey.VALIDATION_INVALID_CURRENCY_CODE)
	.transform((code) => code.toUpperCase());

export const convertRequestSchema = z
	.object({
		amount: z
			.number()
			.positive(ErrorKey.VALIDATION_AMOUNT_NOT_POSITIVE)
			.max(MAX_AMOUNT, ErrorKey.VALIDATION_AMOUNT_TOO_LARGE)
			.refine(hasAtMostTwoDecimals, ErrorKey.VALIDATION_AMOUNT_TOO_MANY_DECIMALS)
			.describe('The amount to convert — positive, at most 2 decimal places, at most 1e12'),
		from: currencyCodeSchema.describe('The source currency — a 3-letter code, case-insensitive'),
		to: currencyCodeSchema.describe('The target currency — a 3-letter code, case-insensitive'),
	})
	.refine((body) => body.from !== body.to, ErrorKey.VALIDATION_SAME_CURRENCY);

export const convertResponseSchema = z.object({
	amount: z.number().describe('The converted amount as requested'),
	from: z.string().describe('The source currency, normalized to uppercase'),
	to: z.string().describe('The target currency, normalized to uppercase'),
	rate: z
		.number()
		.describe('The exchange rate in FULL precision (not a monetary amount) — verifiable math'),
	result: z
		.number()
		.describe('The converted value — the only rounded field (half-up, 2 decimal places)'),
	rateTimestamp: z.iso
		.datetime()
		.describe(
			'The time the rates were fetched from the provider (ISO 8601 UTC) — NOT the moment of the conversion; under the stale fallback it honestly carries the older time',
		),
});

export const statsResponseSchema = z.object({
	totalConversions: z
		.number()
		.int()
		.nonnegative()
		.describe('Total number of conversions ever made — an integer counter'),
	totalAmountEur: z
		.number()
		.nonnegative()
		.describe('Total of all conversions converted to EUR at write time (integer cents / 100)'),
	topTargetCurrency: z
		.string()
		.nullable()
		.describe(
			'The most frequent target currency; ties resolve to the alphabetically first code; null when no conversion was made yet',
		),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export type StatsResponse = z.infer<typeof statsResponseSchema>;

export type ConvertRequest = z.infer<typeof convertRequestSchema>;

export type ConvertResponse = z.infer<typeof convertResponseSchema>;

export type InitResponse = z.infer<typeof initResponseSchema>;

export type CurrenciesResponse = z.infer<typeof currenciesResponseSchema>;
