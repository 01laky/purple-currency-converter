import { z } from 'zod';
import { LANGUAGES } from './i18n/constants.js';
import type { TranslationTree } from './i18n/types.js';
import { ErrorCode } from './lib/enums.js';

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

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export type InitResponse = z.infer<typeof initResponseSchema>;
