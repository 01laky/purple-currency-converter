import {
	DeleteTableCommand,
	DynamoDBClient,
	ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStatsTable } from '../scripts/create-local-table.js';
import { buildApp } from '../src/app.js';
import {
	LOCAL_DYNAMO_CREDENTIALS,
	LOCAL_DYNAMO_ENDPOINT,
	LOCAL_DYNAMO_REGION,
} from '../src/lib/constants.js';
import { EnvVar } from '../src/lib/enums.js';
import { RateProviderUnavailableError } from '../src/rates/errors.js';
import type { RatesProvider } from '../src/rates/types.js';
import { createStatsRepository } from '../src/stats/repository.js';
import type { StatsRepository } from '../src/stats/types.js';
import type { ConvertResponse, StatsResponse } from '../src/schemas.js';

const E2E_TABLE = 'ConversionStatsApiE2eTest';
const RATE = 0.86123456;

const fromEnv = process.env[EnvVar.DYNAMO_ENDPOINT];
const endpoint = fromEnv === undefined || fromEnv === '' ? LOCAL_DYNAMO_ENDPOINT : fromEnv;
const baseClient = new DynamoDBClient({
	endpoint,
	region: LOCAL_DYNAMO_REGION,
	credentials: LOCAL_DYNAMO_CREDENTIALS,
});
const documentClient = DynamoDBDocumentClient.from(baseClient);

/**
 * @name createProviderStub
 *
 * @description Test stub of the rates provider (rule 1). getRate(from, 'EUR') serves the
 * EUR leg of the statistics; failEurLeg makes ONLY that leg throw.
 *
 * @param {boolean} failEurLeg whether the from→EUR rate lookup throws
 *
 * @returns {RatesProvider} the stubbed provider
 */
const createProviderStub = (failEurLeg = false): RatesProvider => ({
	getRate: async (_from, to) => {
		if (failEurLeg && to === 'EUR') {
			throw new RateProviderUnavailableError(new Error('EUR leg down'));
		}
		return { rate: RATE, rateTimestamp: '2026-06-12T10:00:00.000Z' };
	},
	getSupportedCurrencies: async () => ['EUR', 'GBP', 'USD'],
	getCurrencies: async () => ({ EUR: 'Euro', GBP: 'British Pound', USD: 'US Dollar' }),
	getCacheAgeSeconds: () => 0,
});

/**
 * @name dropE2eTable
 *
 * @description Deletes the e2e test table; a missing table is the desired state.
 *
 * @returns {Promise<void>} resolves once the table is gone
 *
 * @throws {Error} any DynamoDB error other than ResourceNotFoundException
 */
const dropE2eTable = async (): Promise<void> => {
	try {
		await baseClient.send(new DeleteTableCommand({ TableName: E2E_TABLE }));
	} catch (error) {
		if (!(error instanceof ResourceNotFoundException)) {
			throw error;
		}
	}
};

describe('GET /api/stats over the DI seam', () => {
	let app: FastifyInstance;

	beforeAll(async () => {
		const statsRepository: StatsRepository = {
			recordConversion: async () => undefined,
			getStats: async () => ({
				totalConversions: 42,
				totalAmountEur: 12345.67,
				topTargetCurrency: 'EUR',
			}),
		};
		app = await buildApp({ ratesProvider: createProviderStub(), statsRepository });
		await app.ready();
	});

	afterAll(async () => {
		await app.close();
	});

	it('returns the totals in the contract shape', async () => {
		const response = await app.inject({ method: 'GET', url: '/api/stats' });

		expect(response.statusCode).toBe(200);
		expect(response.json<StatsResponse>()).toEqual({
			totalConversions: 42,
			totalAmountEur: 12345.67,
			topTargetCurrency: 'EUR',
		});
	});

	it('carries NO cache headers of any kind — the statistics are always fresh', async () => {
		const response = await app.inject({ method: 'GET', url: '/api/stats' });

		expect(response.headers['cache-control']).toBeUndefined();
		expect(response.headers['etag']).toBeUndefined();
		expect(response.headers['expires']).toBeUndefined();
	});

	it('is documented in the OpenAPI specification', async () => {
		const response = await app.inject({ method: 'GET', url: '/docs/json' });

		const document = response.json<{ paths: Record<string, unknown> }>();
		expect(document.paths['/api/stats']).toBeDefined();
	});
});

describe('the statistics step never fails the conversion', () => {
	it('a failing stats repository → the conversion still answers 200', async () => {
		const statsRepository: StatsRepository = {
			recordConversion: async () => {
				throw new Error('DynamoDB down');
			},
			getStats: async () => ({ totalConversions: 0, totalAmountEur: 0, topTargetCurrency: null }),
		};
		const app = await buildApp({ ratesProvider: createProviderStub(), statsRepository });

		const response = await app.inject({
			method: 'POST',
			url: '/api/convert',
			payload: { amount: 100, from: 'EUR', to: 'GBP' },
		});

		expect(response.statusCode).toBe(200);
		expect(response.json<ConvertResponse>().result).toBe(86.12);
		await app.close();
	});

	it('a failing toEurCents (the EUR leg only) → the conversion still answers 200', async () => {
		const statsRepository: StatsRepository = {
			recordConversion: async () => undefined,
			getStats: async () => ({ totalConversions: 0, totalAmountEur: 0, topTargetCurrency: null }),
		};
		const app = await buildApp({
			ratesProvider: createProviderStub(true),
			statsRepository,
		});

		// GBP→USD: the conversion leg works, only the GBP→EUR stats leg throws
		const response = await app.inject({
			method: 'POST',
			url: '/api/convert',
			payload: { amount: 100, from: 'GBP', to: 'USD' },
		});

		expect(response.statusCode).toBe(200);
		expect(response.json<ConvertResponse>().result).toBe(86.12);
		await app.close();
	});
});

describe('end to end: the conversion persists into the statistics', () => {
	beforeAll(async () => {
		await dropE2eTable();
		await createStatsTable(baseClient, E2E_TABLE);
	});

	afterAll(async () => {
		await dropE2eTable();
	});

	it('POST /api/convert lands in GET /api/stats through the real dynamodb-local', async () => {
		const app = await buildApp({
			ratesProvider: createProviderStub(),
			statsRepository: createStatsRepository({ client: documentClient, tableName: E2E_TABLE }),
		});

		const conversion = await app.inject({
			method: 'POST',
			url: '/api/convert',
			payload: { amount: 100, from: 'EUR', to: 'GBP' },
		});
		expect(conversion.statusCode).toBe(200);

		const stats = await app.inject({ method: 'GET', url: '/api/stats' });
		expect(stats.statusCode).toBe(200);
		expect(stats.json<StatsResponse>()).toEqual({
			totalConversions: 1,
			// from = EUR → 100.00 EUR recorded directly as 10000 cents
			totalAmountEur: 100,
			topTargetCurrency: 'GBP',
		});
		await app.close();
	});
});
