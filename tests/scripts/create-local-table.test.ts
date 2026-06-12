import {
	DeleteTableCommand,
	DynamoDBClient,
	ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import { afterAll, describe, expect, it } from 'vitest';
import { createStatsTable } from '../../scripts/create-local-table.js';
import {
	LOCAL_DYNAMO_CREDENTIALS,
	LOCAL_DYNAMO_ENDPOINT,
	LOCAL_DYNAMO_REGION,
} from '../../src/lib/constants.js';
import { EnvVar } from '../../src/lib/enums.js';

const TEST_TABLE = 'ConversionStatsIdempotenceTest';

const fromEnv = process.env[EnvVar.DYNAMO_ENDPOINT];
const endpoint = fromEnv === undefined || fromEnv === '' ? LOCAL_DYNAMO_ENDPOINT : fromEnv;
const client = new DynamoDBClient({
	endpoint,
	region: LOCAL_DYNAMO_REGION,
	credentials: LOCAL_DYNAMO_CREDENTIALS,
});

/**
 * @name dropTestTable
 *
 * @description Deletes the test table; a missing table is fine (the state the test wants),
 * any other error propagates (rule 24).
 *
 * @returns {Promise<void>} resolves once the table is gone
 *
 * @throws {Error} any DynamoDB error other than ResourceNotFoundException
 */
const dropTestTable = async (): Promise<void> => {
	try {
		await client.send(new DeleteTableCommand({ TableName: TEST_TABLE }));
	} catch (error) {
		if (!(error instanceof ResourceNotFoundException)) {
			throw error;
		}
	}
};

afterAll(async () => {
	await dropTestTable();
	client.destroy();
});

describe('createStatsTable (db:init) against dynamodb-local', () => {
	it('creates the table on the first run and accepts it on the second — idempotent', async () => {
		await dropTestTable();

		expect(await createStatsTable(client, TEST_TABLE)).toBe('created');
		expect(await createStatsTable(client, TEST_TABLE)).toBe('already-exists');
	});
});
