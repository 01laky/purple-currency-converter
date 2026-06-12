import { createHash, randomUUID } from 'node:crypto';
import helmet from '@fastify/helmet';
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
import { CURRENCIES_CACHE_CONTROL } from './lib/constants.js';
import { EnvVar, ErrorCode, ErrorKey } from './lib/enums.js';
import type { ApiErrorBody, BuildAppDeps, ErrorParams } from './lib/types.js';
import { RateProviderUnavailableError } from './rates/errors.js';
import { createRatesProvider } from './rates/provider.js';
import type { RatesProvider } from './rates/types.js';
import {
	convertRequestSchema,
	convertResponseSchema,
	currenciesResponseSchema,
	errorResponseSchema,
	healthResponseSchema,
	initResponseSchema,
} from './schemas.js';
import type {
	ConvertRequest,
	CurrenciesResponse,
	HealthResponse,
	InitResponse,
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
 * shape: an unsupported currency becomes 422 UNSUPPORTED_CURRENCY with params.code; an
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
	if (error instanceof RateProviderUnavailableError) {
		await reply
			.status(502)
			.send(buildErrorBody(ErrorCode.RATE_PROVIDER_ERROR, ErrorKey.RATE_PROVIDER));
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
 * @returns {() => HealthResponse} the route handler
 */
const createHealthHandler = (ratesProvider: RatesProvider) => (): HealthResponse => ({
	ok: true,
	version: pkg.version,
	uptime: Math.round(process.uptime()),
	ratesCacheAge: ratesProvider.getCacheAgeSeconds(),
});

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
 * @description Builds the POST /api/convert handler (proposal §3/§5): the body arrives
 * validated and normalized by the Zod schema; the service validates the currencies against
 * the supported list, fetches the full-precision cross-rate and rounds the result exactly
 * once.
 *
 * @param {RatesProvider} ratesProvider the provider serving the rates
 *
 * @returns {(request: FastifyRequest<{ Body: ConvertRequest }>) => Promise<ConvertResult>} the route handler
 */
const createConvertHandler =
	(ratesProvider: RatesProvider) =>
	async (request: FastifyRequest<{ Body: ConvertRequest }>): Promise<ConvertResult> =>
		convertAmount(request.body, ratesProvider);

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
	});

	app.setValidatorCompiler(validatorCompiler);
	app.setSerializerCompiler(serializerCompiler);

	// CSP would block Swagger UI's inline scripts and styles at /docs
	await app.register(helmet, { contentSecurityPolicy: false });

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
	await app.register(swaggerUi, { routePrefix: '/docs' });

	app.addHook('onRequest', setRequestIdHeader);
	app.addHook('onResponse', logRequestCompletion);
	app.setNotFoundHandler(notFoundHandler);
	app.setErrorHandler(errorHandler);

	const ratesProvider = deps?.ratesProvider ?? createRatesProvider();

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
			schema: {
				summary: 'Convert an amount between two currencies',
				description:
					'Converts the amount using the live cross-rate through the USD base. The rate is ' +
					'returned in FULL precision; result is the only rounded field (half-up, 2 decimal ' +
					'places). rateTimestamp is the time the rates were fetched from the provider, NOT ' +
					'the moment of the conversion — under the stale fallback it honestly carries the ' +
					'older time. Currency codes are case-insensitive and normalized to uppercase; the ' +
					'supported set is the same the /api/currencies endpoint lists.',
				tags: ['conversion'],
				body: convertRequestSchema,
				response: {
					200: convertResponseSchema,
					400: errorResponseSchema,
					422: errorResponseSchema,
					500: errorResponseSchema,
					502: errorResponseSchema,
				},
			},
		},
		createConvertHandler(ratesProvider),
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
