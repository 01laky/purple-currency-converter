import { CreateTableCommand, ResourceInUseException } from '@aws-sdk/client-dynamodb';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { pathToFileURL } from 'node:url';
import { DEFAULT_STATS_TABLE, LOCAL_DYNAMO_ENDPOINT } from '../src/lib/constants.js';
import { createDynamoClient } from '../src/lib/dynamo.js';
import { EnvVar } from '../src/lib/enums.js';

/**
 * @name createStatsTable
 *
 * @description Creates the statistics table (pk/sk string keys, on-demand billing — proposal §6).
 * Idempotent: an already existing table (ResourceInUseException) is accepted; any other error
 * propagates (rule 24).
 *
 * @param {DynamoDBClient} client the DynamoDB client to use
 * @param {string} tableName name of the table to create
 *
 * @returns {Promise<'created' | 'already-exists'>} what happened
 *
 * @throws {Error} any DynamoDB error other than ResourceInUseException
 */
export const createStatsTable = async (
	client: DynamoDBClient,
	tableName: string,
): Promise<'created' | 'already-exists'> => {
	try {
		await client.send(
			new CreateTableCommand({
				TableName: tableName,
				AttributeDefinitions: [
					{ AttributeName: 'pk', AttributeType: 'S' },
					{ AttributeName: 'sk', AttributeType: 'S' },
				],
				KeySchema: [
					{ AttributeName: 'pk', KeyType: 'HASH' },
					{ AttributeName: 'sk', KeyType: 'RANGE' },
				],
				BillingMode: 'PAY_PER_REQUEST',
			}),
		);
		return 'created';
	} catch (error) {
		if (error instanceof ResourceInUseException) {
			return 'already-exists';
		}
		throw error;
	}
};

const isMain =
	process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
	const fromEnv = process.env[EnvVar.STATS_TABLE];
	const tableName = fromEnv === undefined || fromEnv === '' ? DEFAULT_STATS_TABLE : fromEnv;
	// db:init is a local-only tool — the AWS table is created by SST (v0.7.0)
	const client = createDynamoClient(LOCAL_DYNAMO_ENDPOINT);
	const result = await createStatsTable(client, tableName);
	client.destroy();
	process.stdout.write(`Table "${tableName}": ${result}\n`);
}
