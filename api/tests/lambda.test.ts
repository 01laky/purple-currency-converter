import type { Context } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { handler } from '../src/lambda.js';
import type { HealthResponse } from '../src/schemas.js';

// A Lambda FUNCTION URL event — payload format 2.0 (version, requestContext.http, rawPath).
// SST `url: true` never sends the API Gateway v1 shape (httpMethod) — a v1 fixture would
// exercise an adapter branch production never executes (prompt v0.7.0).
const FUNCTION_URL_EVENT = {
	version: '2.0',
	routeKey: '$default',
	rawPath: '/health',
	rawQueryString: '',
	headers: {
		host: 'test.lambda-url.eu-central-1.on.aws',
		'user-agent': 'vitest',
	},
	requestContext: {
		accountId: 'anonymous',
		apiId: 'test',
		domainName: 'test.lambda-url.eu-central-1.on.aws',
		domainPrefix: 'test',
		http: {
			method: 'GET',
			path: '/health',
			protocol: 'HTTP/1.1',
			sourceIp: '127.0.0.1',
			userAgent: 'vitest',
		},
		requestId: 'test-request-id',
		routeKey: '$default',
		stage: '$default',
		time: '12/Jun/2026:00:00:00 +0000',
		timeEpoch: 1781222400000,
	},
	isBase64Encoded: false,
};

// the full Context shape — no casts (rule 23); the deprecated callbacks are typed no-ops
const LAMBDA_CONTEXT: Context = {
	awsRequestId: 'test-aws-request-id',
	callbackWaitsForEmptyEventLoop: false,
	functionName: 'purple-currency-converter-test',
	functionVersion: '$LATEST',
	invokedFunctionArn:
		'arn:aws:lambda:eu-central-1:000000000000:function:purple-currency-converter-test',
	memoryLimitInMB: '512',
	logGroupName: '/aws/lambda/purple-currency-converter-test',
	logStreamName: 'test-stream',
	getRemainingTimeInMillis: () => 10_000,
	done: () => undefined,
	fail: () => undefined,
	succeed: () => undefined,
};

describe('the Lambda adapter (offline)', () => {
	it('serves GET /health through a Function URL payload-format-2.0 event', async () => {
		const result = await handler(FUNCTION_URL_EVENT, LAMBDA_CONTEXT);

		expect(result.statusCode).toBe(200);
		const body: HealthResponse = JSON.parse(result.body);
		expect(body.ok).toBe(true);
		expect(typeof body.uptime).toBe('number');
		expect(body.ratesCacheAge).toBeNull();
		expect(result.headers?.['x-request-id']).toBeDefined();
	});

	it('keeps the unified error shape for an unknown route through the adapter', async () => {
		const event = {
			...FUNCTION_URL_EVENT,
			rawPath: '/definitely-not-here',
			requestContext: {
				...FUNCTION_URL_EVENT.requestContext,
				http: { ...FUNCTION_URL_EVENT.requestContext.http, path: '/definitely-not-here' },
			},
		};

		const result = await handler(event, LAMBDA_CONTEXT);

		expect(result.statusCode).toBe(404);
		expect(JSON.parse(result.body).error.code).toBe('NOT_FOUND');
	});
});
