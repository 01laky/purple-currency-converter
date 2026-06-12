import {
	DeleteTableCommand,
	DynamoDBClient,
	ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createStatsTable } from '../../scripts/create-local-table.js';
import {
	LOCAL_DYNAMO_CREDENTIALS,
	LOCAL_DYNAMO_ENDPOINT,
	LOCAL_DYNAMO_REGION,
} from '../../src/lib/constants.js';
import { EnvVar } from '../../src/lib/enums.js';
import { createStatsRepository } from '../../src/stats/repository.js';
import type { StatsWriteLogger } from '../../src/stats/types.js';

const TEST_TABLE = 'ConversionStatsRepositoryTest';

const fromEnv = process.env[EnvVar.DYNAMO_ENDPOINT];
const endpoint = fromEnv === undefined || fromEnv === '' ? LOCAL_DYNAMO_ENDPOINT : fromEnv;
const baseClient = new DynamoDBClient({
	endpoint,
	region: LOCAL_DYNAMO_REGION,
	credentials: LOCAL_DYNAMO_CREDENTIALS,
});
const documentClient = DynamoDBDocumentClient.from(baseClient);

const silentLogger: StatsWriteLogger = { warn: () => undefined };

/**
 * @name dropTestTable
 *
 * @description Deletes the test table; a missing table is the desired state (rule 24 — any
 * other error propagates).
 *
 * @returns {Promise<void>} resolves once the table is gone
 *
 * @throws {Error} any DynamoDB error other than ResourceNotFoundException
 */
const dropTestTable = async (): Promise<void> => {
	try {
		await baseClient.send(new DeleteTableCommand({ TableName: TEST_TABLE }));
	} catch (error) {
		if (!(error instanceof ResourceNotFoundException)) {
			throw error;
		}
	}
};

beforeAll(async () => {
	await dropTestTable();
	await createStatsTable(baseClient, TEST_TABLE);
});

afterAll(async () => {
	await dropTestTable();
	baseClient.destroy();
});

describe('createStatsRepository against dynamodb-local', () => {
	it('starts with the honest empty state — zeros and a null top currency', async () => {
		const repository = createStatsRepository({ client: documentClient, tableName: TEST_TABLE });

		expect(await repository.getStats()).toEqual({
			totalConversions: 0,
			totalAmountEur: 0,
			topTargetCurrency: null,
		});
	});

	it('records conversions transactionally — the global counters always match the target sum', async () => {
		const repository = createStatsRepository({ client: documentClient, tableName: TEST_TABLE });

		await repository.recordConversion(
			{ targetCurrency: 'GBP', amountEurCents: 10050 },
			silentLogger,
		);
		await repository.recordConversion({ targetCurrency: 'CZK', amountEurCents: 950 }, silentLogger);
		await repository.recordConversion(
			{ targetCurrency: 'GBP', amountEurCents: 2000 },
			silentLogger,
		);

		const stats = await repository.getStats();
		expect(stats.totalConversions).toBe(3);
		expect(stats.totalAmountEur).toBe(130);
		expect(stats.topTargetCurrency).toBe('GBP');
	});

	it('resolves ties to the alphabetically FIRST currency — one pass, strict >, no sort', async () => {
		// after the previous test: GBP=2, CZK=1 — one more CZK makes it 2:2; CZK < GBP alphabetically
		const repository = createStatsRepository({ client: documentClient, tableName: TEST_TABLE });

		await repository.recordConversion({ targetCurrency: 'CZK', amountEurCents: 100 }, silentLogger);

		expect((await repository.getStats()).topTargetCurrency).toBe('CZK');
	});

	it('retries a transient failure — two failures, one success, two warn lines', async () => {
		const flakyClient = DynamoDBDocumentClient.from(baseClient);
		const sendSpy = vi
			.spyOn(flakyClient, 'send')
			.mockRejectedValueOnce(new Error('transient DynamoDB hiccup'))
			.mockRejectedValueOnce(new Error('transient DynamoDB hiccup'))
			.mockResolvedValueOnce(undefined);
		const warn = vi.fn();
		const repository = createStatsRepository({
			client: flakyClient,
			tableName: TEST_TABLE,
			retryDelayMs: 1,
		});

		await repository.recordConversion({ targetCurrency: 'USD', amountEurCents: 500 }, { warn });

		expect(sendSpy).toHaveBeenCalledTimes(3);
		expect(warn).toHaveBeenCalledTimes(2);
		sendSpy.mockRestore();
	});

	it('throws after three failed attempts — the route layer turns it into a logged 200', async () => {
		const deadClient = DynamoDBDocumentClient.from(baseClient);
		const sendSpy = vi.spyOn(deadClient, 'send').mockRejectedValue(new Error('DynamoDB down'));
		const warn = vi.fn();
		const repository = createStatsRepository({
			client: deadClient,
			tableName: TEST_TABLE,
			retryDelayMs: 1,
		});

		await expect(
			repository.recordConversion({ targetCurrency: 'USD', amountEurCents: 500 }, { warn }),
		).rejects.toThrowError('DynamoDB down');
		expect(sendSpy).toHaveBeenCalledTimes(3);
		expect(warn).toHaveBeenCalledTimes(2);
		sendSpy.mockRestore();
	});
});
