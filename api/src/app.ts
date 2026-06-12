import { createHash, randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastify from 'fastify';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
	hasZodFastifySchemaValidationErrors,
	jsonSchemaTransform,
	serializerCompiler,
	validatorCompiler,
} from 'fastify-type-provider-zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import pkg from '../package.json' with { type: 'json' };
import { UnsupportedCurrencyError } from './conversion/errors.js';
import { convertAmount } from './conversion/service.js';
import type { ConvertResult } from './conversion/types.js';
import { LANGUAGES } from './i18n/constants.js';
import { TRANSLATIONS, formatEnglishMessage } from './i18n/loader.js';
import {
	CURRENCIES_CACHE_CONTROL,
	DEFAULT_FRONTEND_ORIGIN,
	NO_STORE_CACHE_CONTROL,
	RATE_LIMIT_MAX,
	RATE_LIMIT_WINDOW,
	TRUST_PROXY_HOPS,
} from './lib/constants.js';
import { EnvVar, ErrorCode, ErrorKey } from './lib/enums.js';
import { RateLimitExceededError } from './lib/errors.js';
import { resolveSwaggerStaticDir } from './lib/swagger.js';
import type { ApiErrorBody, BuildAppDeps, ErrorParams } from './lib/types.js';
import { RateProviderUnavailableError, UnknownRateCurrencyError } from './rates/errors.js';
import { createRatesProvider } from './rates/provider.js';
import type { RatesProvider } from './rates/types.js';
import { toEurCents } from './stats/eur.js';
import { createStatsRepository } from './stats/repository.js';
import type { StatsRepository } from './stats/types.js';
import {
	convertRequestSchema,
	convertResponseSchema,
	currenciesResponseSchema,
	errorResponseSchema,
	healthResponseSchema,
	initResponseSchema,
	statsResponseSchema,
} from './schemas.js';
import type {
	ConvertRequest,
	CurrenciesResponse,
	HealthResponse,
	InitResponse,
	StatsResponse,
} from './schemas.js';

// ErrorKey values for the Zod-key passthrough guard — schema messages ARE keys (§3)
const ERROR_KEY_VALUES: readonly string[] = Object.values(ErrorKey);

/**
 * @name isErrorKey
 *
 * @description Type guard — whether a Zod issue message is one of the catalog keys. Zod's own
 * default messages (e.g. a type mismatch) are English sentences, not keys — those fall back to
 * the generic errors.validation.invalidRequest instead of crashing the message lookup.
 *
 * @param {string} value the Zod issue message
 *
 * @returns {boolean} true when the message is a known ErrorKey
 */
const isErrorKey = (value: string): value is ErrorKey => ERROR_KEY_VALUES.includes(value);

const INIT_RESPONSE: InitResponse = { languages: [...LANGUAGES], translations: TRANSLATIONS };

// The texts are static per process (proposal §3) — one hash for the whole lifetime
const INIT_ETAG = `"${createHash('sha256').update(JSON.stringify(INIT_RESPONSE)).digest('hex')}"`;

/**
 * @name buildErrorBody
 *
 * @description Builds the unified error response body { error: { code, key, message, params? } }
 * (proposal §3). The message is the EN translation of the key with the params interpolated —
 * the i18n files are the single source of every text.
 *
 * @param {ErrorCode} code programmatic error code
 * @param {ErrorKey} key i18n key of the message
 * @param {ErrorParams} params optional interpolation values
 *
 * @returns {ApiErrorBody} the response body in the unified error shape
 *
 * @throws {Error} when the key is missing from the EN translations (rule 24 — no fallback)
 */
const buildErrorBody = (code: ErrorCode, key: ErrorKey, params?: ErrorParams): ApiErrorBody => {
	const body: ApiErrorBody = { error: { code, key, message: formatEnglishMessage(key, params) } };
	if (params !== undefined) {
		body.error.params = params;
	}
	return body;
};

/**
 * @name buildRateLimitErrorResponse
 *
 * @description errorResponseBuilder of @fastify/rate-limit (proposal §9). The plugin THROWS
 * the builder's return value, so the builder returns a recognizable Error — the central
 * handler maps it onto the unified 429 body (the plugin's default { statusCode, error,
 * message } shape never reaches the client).
 *
 * @returns {RateLimitExceededError} the error the central handler maps to the 429
 */
const buildRateLimitErrorResponse = (): RateLimitExceededError => new RateLimitExceededError();

/**
 * @name setRequestIdHeader
 *
 * @description onRequest hook — mirrors the generated request id into the X-Request-Id response
 * header so every response can be paired with its log lines (proposal §9).
 *
 * @param {FastifyRequest} request the incoming request
 * @param {FastifyReply} reply the reply being built
 *
 * @returns {Promise<void>} resolves once the header is set
 */
const setRequestIdHeader = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
	void reply.header('x-request-id', request.id);
};

/**
 * @name logRequestCompletion
 *
 * @description onResponse hook — the single log line per request (status, latency, method, URL
 * without the query string); the request id is bound by the request logger (proposal §9).
 *
 * @param {FastifyRequest} request the served request
 * @param {FastifyReply} reply the sent reply
 *
 * @returns {Promise<void>} resolves once the line is logged
 */
const logRequestCompletion = async (
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<void> => {
	request.log.info(
		{
			method: request.method,
			url: request.url.split('?')[0] ?? request.url,
			statusCode: reply.statusCode,
			durationMs: Math.round(reply.elapsedTime),
		},
		'request completed',
	);
};

/**
 * @name notFoundHandler
 *
 * @description Replies to unknown routes with the unified 404 error shape — the API never
 * returns a response outside the error model (proposal §3).
 *
 * @param {FastifyRequest} _request the unmatched request
 * @param {FastifyReply} reply the reply being built
 *
 * @returns {Promise<void>} resolves once the response is sent
 */
const notFoundHandler = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
	await reply.status(404).send(buildErrorBody(ErrorCode.NOT_FOUND, ErrorKey.NOT_FOUND));
};

/**
 * @name errorHandler
 *
 * @description The central error handler (proposal §3). Normalizes every error into the unified
 * shape: an unsupported currency becomes 422 UNSUPPORTED_CURRENCY with params.code (an
 * UnknownRateCurrencyError escaping the supported-list race maps to the SAME 422 — defense in
 * depth, v0.11.0); an exceeded rate limit becomes 429 RATE_LIMITED (§9); an
 * unreachable rate provider (no stale copy) becomes 502 RATE_PROVIDER_ERROR; a Zod schema
 * failure (detected via hasZodFastifySchemaValidationErrors) becomes 400 VALIDATION_ERROR with
 * the key taken from error.validation[0].message — the schema message IS the i18n key (§3);
 * remaining Fastify 4xx internals (JSON parse, body over the limit, content type) become
 * VALIDATION_ERROR with the generic invalidRequest key and the original status; anything else
 * is a 500 INTERNAL_ERROR with no internals in the response — the full error goes into the log
 * with the request id (rule 24).
 *
 * @param {FastifyError} error the thrown error
 * @param {FastifyRequest} request the request being served
 * @param {FastifyReply} reply the reply being built
 *
 * @returns {Promise<void>} resolves once the response is sent
 */
const errorHandler = async (
	error: FastifyError,
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<void> => {
	if (error instanceof UnsupportedCurrencyError) {
		await reply.status(422).send(
			buildErrorBody(ErrorCode.UNSUPPORTED_CURRENCY, ErrorKey.UNSUPPORTED_CURRENCY, {
				code: error.code,
			}),
		);
		return;
	}
	if (error instanceof UnknownRateCurrencyError) {
		// defense in depth (v0.11.0 adversarial pass): between the supported-list check and the
		// rate lookup the cache may refetch and a currency can vanish — §3 forbids an external
		// data change to surface as a 500, so the escape maps to the same 422 as the validation
		await reply.status(422).send(
			buildErrorBody(ErrorCode.UNSUPPORTED_CURRENCY, ErrorKey.UNSUPPORTED_CURRENCY, {
				code: error.code,
			}),
		);
		return;
	}
	if (error instanceof RateProviderUnavailableError) {
		await reply
			.status(502)
			.send(buildErrorBody(ErrorCode.RATE_PROVIDER_ERROR, ErrorKey.RATE_PROVIDER));
		return;
	}
	if (error instanceof RateLimitExceededError) {
		await reply.status(429).send(buildErrorBody(ErrorCode.RATE_LIMITED, ErrorKey.RATE_LIMITED));
		return;
	}
	if (hasZodFastifySchemaValidationErrors(error)) {
		const issueMessage = error.validation[0]?.message;
		const key =
			issueMessage !== undefined && isErrorKey(issueMessage)
				? issueMessage
				: ErrorKey.VALIDATION_INVALID_REQUEST;
		await reply.status(400).send(buildErrorBody(ErrorCode.VALIDATION_ERROR, key));
		return;
	}
	const statusCode = error.statusCode ?? 500;
	if (statusCode >= 400 && statusCode < 500) {
		await reply
			.status(statusCode)
			.send(buildErrorBody(ErrorCode.VALIDATION_ERROR, ErrorKey.VALIDATION_INVALID_REQUEST));
		return;
	}
	request.log.error({ err: error }, 'unhandled error');
	await reply.status(500).send(buildErrorBody(ErrorCode.INTERNAL_ERROR, ErrorKey.INTERNAL));
};

/**
 * @name createHealthHandler
 *
 * @description Builds the GET /health handler — instance diagnostics (proposal §3): the
 * version from package.json, the process uptime and the real age of the rates cache (null
 * before the first fetch; /health itself never triggers a fetch).
 *
 * @param {RatesProvider} ratesProvider the provider whose cache age is reported
 *
 * @returns {(request: FastifyRequest, reply: FastifyReply) => HealthResponse} the route handler
 */
const createHealthHandler =
	(ratesProvider: RatesProvider) =>
	(_request: FastifyRequest, reply: FastifyReply): HealthResponse => {
		// no-store (§3 revised at 0.10.0) — cached diagnostics lie behind CloudFront
		void reply.header('cache-control', NO_STORE_CACHE_CONTROL);
		return {
			ok: true,
			version: pkg.version,
			uptime: Math.round(process.uptime()),
			ratesCacheAge: ratesProvider.getCacheAgeSeconds(),
		};
	};

/**
 * @name createCurrenciesHandler
 *
 * @description Builds the GET /api/currencies handler (proposal §3): the intersection of the
 * currency names and the cached rates from the provider, with Cache-Control: public,
 * max-age=3600 — the browser/CDN side of the caching; the server side is the provider cache.
 *
 * @param {RatesProvider} ratesProvider the provider serving the currencies
 *
 * @returns {(request: FastifyRequest, reply: FastifyReply) => Promise<CurrenciesResponse>} the route handler
 */
const createCurrenciesHandler =
	(ratesProvider: RatesProvider) =>
	async (_request: FastifyRequest, reply: FastifyReply): Promise<CurrenciesResponse> => {
		void reply.header('cache-control', CURRENCIES_CACHE_CONTROL);
		return { currencies: await ratesProvider.getCurrencies() };
	};

/**
 * @name createConvertHandler
 *
 * @description Builds the POST /api/convert handler (proposal §3/§5/§6): the body arrives
 * validated and normalized by the Zod schema; the service validates the currencies against
 * the supported list, fetches the full-precision cross-rate and rounds the result exactly
 * once. After a successful conversion the WHOLE statistics step (the EUR conversion AND the
 * counter write) runs inside one try/catch — a failure of either leg is logged with the
 * request id and the 200 response goes out unchanged: the conversion never fails because of
 * statistics (§6).
 *
 * @param {RatesProvider} ratesProvider the provider serving the rates
 * @param {StatsRepository} statsRepository the repository recording the conversion
 *
 * @returns {(request: FastifyRequest<{ Body: ConvertRequest }>) => Promise<ConvertResult>} the route handler
 */
const createConvertHandler =
	(ratesProvider: RatesProvider, statsRepository: StatsRepository) =>
	async (request: FastifyRequest<{ Body: ConvertRequest }>): Promise<ConvertResult> => {
		const conversion = await convertAmount(request.body, ratesProvider);
		try {
			// ONE try around BOTH legs — toEurCents can throw too (prompt v0.6.0)
			const amountEurCents = await toEurCents(conversion.amount, conversion.from, ratesProvider);
			await statsRepository.recordConversion(
				{ targetCurrency: conversion.to, amountEurCents },
				request.log,
			);
		} catch (error) {
			request.log.error(
				{ err: error },
				'statistics step failed — the conversion response is unaffected',
			);
		}
		return conversion;
	};

/**
 * @name createStatsHandler
 *
 * @description Builds the GET /api/stats handler (proposal §3/§6): the persistent totals and
 * the top target currency, always fresh — the statistics are never cached anywhere, so the
 * handler sets NO cache headers of any kind.
 *
 * @param {StatsRepository} statsRepository the repository serving the totals
 *
 * @returns {(request: FastifyRequest, reply: FastifyReply) => Promise<StatsResponse>} the route handler
 */
const createStatsHandler =
	(statsRepository: StatsRepository) =>
	(_request: FastifyRequest, reply: FastifyReply): Promise<StatsResponse> => {
		// the §3 always-fresh guarantee, made EXPLICIT (revised at 0.10.0): behind the Router a
		// missing Cache-Control is a vacuum CloudFront may fill — no-store defends regardless
		void reply.header('cache-control', NO_STORE_CACHE_CONTROL);
		return statsRepository.getStats();
	};

/**
 * @name initHandler
 *
 * @description Handler of GET /api/init (proposal §3): serves the languages and all the
 * translation trees at once. Every response carries the process-constant strong ETag and
 * Cache-Control: no-cache; a request whose If-None-Match matches gets 304 Not Modified with
 * an empty body — standard HTTP revalidation, no custom cache logic.
 *
 * @param {FastifyRequest} request the incoming request (read for If-None-Match)
 * @param {FastifyReply} reply the reply being built
 *
 * @returns {Promise<InitResponse | undefined>} the payload, or undefined once the 304 is sent
 */
const initHandler = async (
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<InitResponse | undefined> => {
	void reply.header('etag', INIT_ETAG);
	void reply.header('cache-control', 'no-cache');
	if (request.headers['if-none-match'] === INIT_ETAG) {
		await reply.code(304).send();
		return undefined;
	}
	return INIT_RESPONSE;
};

/**
 * @name buildApp
 *
 * @description Builds the pure Fastify app with all the logic (adapter architecture, proposal
 * §2): the Zod type provider, security headers, Swagger at /docs generated from the Zod schemas,
 * the request-id and log policy hooks, the central error handler and the routes. Adapters
 * (server.ts, lambda.ts) only host the returned instance. The optional deps are the DI seam
 * for tests (rule 1) — production callers pass nothing.
 *
 * @param {BuildAppDeps} deps optional overrides (the rates provider)
 *
 * @returns {Promise<FastifyInstance>} the configured Fastify instance, not yet listening
 */
export const buildApp = async (deps?: BuildAppDeps): Promise<FastifyInstance> => {
	const nodeEnv = process.env[EnvVar.NODE_ENV];
	const app = fastify({
		logger: nodeEnv === 'test' ? false : { level: nodeEnv === 'production' ? 'info' : 'debug' },
		disableRequestLogging: true,
		genReqId: () => randomUUID(),
		// §9: request.ip = the viewer IP CloudFront appended (the rightmost x-forwarded-for
		// entry) — NOT `true`, which would trust the client-forged leftmost entry
		trustProxy: TRUST_PROXY_HOPS,
	});

	app.setValidatorCompiler(validatorCompiler);
	app.setSerializerCompiler(serializerCompiler);

	// CSP would block Swagger UI's inline scripts and styles at /docs
	await app.register(helmet, { contentSecurityPolicy: false });

	// §9: the limiter guards POST /api/convert ONLY (the one writing endpoint) — enabled
	// per route through config.rateLimit, never globally; counts in onRequest, before validation
	await app.register(rateLimit, { global: false, errorResponseBuilder: buildRateLimitErrorResponse });

	// CORS for the LOCAL web dev only (§10): web:5173 → api:3000 is cross-origin; production
	// is same-origin through the Router (0.10.0) — no CORS exists there. Exact origin, never *.
	if (nodeEnv !== 'production') {
		const frontendOrigin = process.env[EnvVar.FRONTEND_ORIGIN];
		await app.register(cors, {
			origin:
				frontendOrigin !== undefined && frontendOrigin !== ''
					? frontendOrigin
					: DEFAULT_FRONTEND_ORIGIN,
		});
	}

	await app.register(swagger, {
		openapi: {
			info: {
				title: 'Currency Conversion API',
				description: 'Currency conversion with live exchange rates — Purple LAB case study.',
				version: pkg.version,
			},
		},
		transform: jsonSchemaTransform,
	});
	await app.register(swaggerUi, { routePrefix: '/docs', baseDir: resolveSwaggerStaticDir() });

	app.addHook('onRequest', setRequestIdHeader);
	app.addHook('onResponse', logRequestCompletion);
	app.setNotFoundHandler(notFoundHandler);
	app.setErrorHandler(errorHandler);

	// the app logger (not request-scoped — the cache outlives requests) observes stale serves
	const ratesProvider = deps?.ratesProvider ?? createRatesProvider({ logger: app.log });
	const statsRepository = deps?.statsRepository ?? createStatsRepository();

	const typed = app.withTypeProvider<ZodTypeProvider>();

	typed.get(
		'/health',
		{
			schema: {
				summary: 'Instance diagnostics',
				description:
					'Version, process uptime and the age of the rates cache of the responding instance. ' +
					'ratesCacheAge is null before the first rates fetch (the cache exists from v0.3.0).',
				tags: ['system'],
				response: { 200: healthResponseSchema, 500: errorResponseSchema },
			},
		},
		createHealthHandler(ratesProvider),
	);

	typed.get(
		'/api/currencies',
		{
			schema: {
				summary: 'Supported currencies',
				description:
					'Currency codes mapped to display names for the conversion selects. The response is ' +
					'the INTERSECTION of the OER currency names and the cached rates — only currencies ' +
					'that have a rate are listed, so the list never diverges from what /api/convert ' +
					'accepts. Carries Cache-Control: public, max-age=3600.',
				tags: ['conversion'],
				response: {
					200: currenciesResponseSchema,
					500: errorResponseSchema,
					502: errorResponseSchema,
				},
			},
		},
		createCurrenciesHandler(ratesProvider),
	);

	typed.post(
		'/api/convert',
		{
			// §9: the per-route rate limit — counted in onRequest (before validation), keyed by
			// request.ip; per Lambda instance, the README documents the trade-off
			config: {
				rateLimit: {
					max: deps?.rateLimitMax ?? RATE_LIMIT_MAX,
					timeWindow: RATE_LIMIT_WINDOW,
				},
			},
			schema: {
				summary: 'Convert an amount between two currencies',
				description:
					'Converts the amount using the live cross-rate through the USD base. The rate is ' +
					'returned in FULL precision; result is the only rounded field (half-up, 2 decimal ' +
					'places). rateTimestamp is the time the rates were fetched from the provider, NOT ' +
					'the moment of the conversion — under the stale fallback it honestly carries the ' +
					'older time. Currency codes are case-insensitive and normalized to uppercase; the ' +
					'supported set is the same the /api/currencies endpoint lists. Rate limited to ' +
					'60 requests per minute per client IP (per serving instance).',
				tags: ['conversion'],
				body: convertRequestSchema,
				response: {
					200: convertResponseSchema,
					400: errorResponseSchema,
					422: errorResponseSchema,
					429: errorResponseSchema,
					500: errorResponseSchema,
					502: errorResponseSchema,
				},
			},
		},
		createConvertHandler(ratesProvider, statsRepository),
	);

	typed.get(
		'/api/stats',
		{
			schema: {
				summary: 'Conversion statistics',
				description:
					'The persistent totals: the number of conversions, the total amount converted to ' +
					'EUR at write time, and the most frequent target currency (ties resolve to the ' +
					'alphabetically first code; null before the first conversion). Never cached — ' +
					'the response is always fresh.',
				tags: ['statistics'],
				response: { 200: statsResponseSchema, 500: errorResponseSchema },
			},
		},
		createStatsHandler(statsRepository),
	);

	typed.get(
		'/api/init',
		{
			schema: {
				summary: 'All texts of the system',
				description:
					'The supported languages and the complete translation trees of all of them at once. ' +
					'Every response carries a strong ETag (constant for the process lifetime) and ' +
					'Cache-Control: no-cache; a request with a matching If-None-Match receives ' +
					'304 Not Modified with an empty body.',
				tags: ['i18n'],
				response: { 200: initResponseSchema, 500: errorResponseSchema },
			},
		},
		initHandler,
	);

	return app;
};
