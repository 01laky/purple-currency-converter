import { randomUUID } from 'node:crypto';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastify from 'fastify';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
	jsonSchemaTransform,
	serializerCompiler,
	validatorCompiler,
} from 'fastify-type-provider-zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import pkg from '../package.json' with { type: 'json' };
import { ENGLISH_MESSAGES } from './lib/constants.js';
import { EnvVar, ErrorCode, ErrorKey } from './lib/enums.js';
import type { ApiErrorBody, ErrorParams } from './lib/types.js';
import { errorResponseSchema, healthResponseSchema } from './schemas.js';
import type { HealthResponse } from './schemas.js';

/**
 * @name buildErrorBody
 *
 * @description Builds the unified error response body { error: { code, key, message, params? } }
 * (proposal §3). The message is the English text of the key; the i18n files become the source
 * in v0.2.0.
 *
 * @param {ErrorCode} code programmatic error code
 * @param {ErrorKey} key i18n key of the message
 * @param {ErrorParams} params optional interpolation values
 *
 * @returns {ApiErrorBody} the response body in the unified error shape
 */
const buildErrorBody = (code: ErrorCode, key: ErrorKey, params?: ErrorParams): ApiErrorBody => {
	const body: ApiErrorBody = { error: { code, key, message: ENGLISH_MESSAGES[key] } };
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
 * shape: Fastify 4xx internals (JSON parse, body over the limit, content type) become
 * VALIDATION_ERROR with the original status; anything else is a 500 INTERNAL_ERROR with no
 * internals in the response — the full error goes into the log with the request id (rule 24).
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
 * @name healthHandler
 *
 * @description Handler of GET /health — instance diagnostics (proposal §3): the version from
 * package.json, the process uptime and the rates-cache age (null until the cache exists, v0.3.0).
 *
 * @returns {HealthResponse} the health response body
 */
const healthHandler = (): HealthResponse => ({
	ok: true,
	version: pkg.version,
	uptime: Math.round(process.uptime()),
	ratesCacheAge: null,
});

/**
 * @name buildApp
 *
 * @description Builds the pure Fastify app with all the logic (adapter architecture, proposal
 * §2): the Zod type provider, security headers, Swagger at /docs generated from the Zod schemas,
 * the request-id and log policy hooks, the central error handler and the routes. Adapters
 * (server.ts, lambda.ts) only host the returned instance.
 *
 * @returns {Promise<FastifyInstance>} the configured Fastify instance, not yet listening
 */
export const buildApp = async (): Promise<FastifyInstance> => {
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

	app.withTypeProvider<ZodTypeProvider>().get(
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
		healthHandler,
	);

	return app;
};
