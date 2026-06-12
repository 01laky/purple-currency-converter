import { QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { setTimeout as delay } from 'node:timers/promises';
import { DEFAULT_STATS_TABLE } from '../lib/constants.js';
import { createDocumentClient } from '../lib/dynamo.js';
import { EnvVar } from '../lib/enums.js';
import {
	GLOBAL_SK,
	STATS_PK,
	TARGET_SK_PREFIX,
	WRITE_ATTEMPTS,
	WRITE_RETRY_DELAY_MS,
} from './constants.js';
import type { StatsRepository, StatsRepositoryDeps } from './types.js';

/**
 * @name resolveTableName
 *
 * @description Resolves the statistics table name: the explicit override, then STATS_TABLE
 * from the environment, then the local default.
 *
 * @param {string | undefined} override the deps-level table name override
 *
 * @returns {string} the table name to use
 */
const resolveTableName = (override?: string): string => {
	if (override !== undefined && override !== '') {
		return override;
	}
	const fromEnv = process.env[EnvVar.STATS_TABLE];
	return fromEnv !== undefined && fromEnv !== '' ? fromEnv : DEFAULT_STATS_TABLE;
};

/**
 * @name readNumber
 *
 * @description Reads a numeric attribute from a Query item; a missing or non-numeric value
 * counts as 0 (the items are written exclusively by this module — proposal §6).
 *
 * @param {Record<string, unknown>} item the Query item
 * @param {string} key the attribute name
 *
 * @returns {number} the numeric value, or 0
 */
const readNumber = (item: Record<string, unknown>, key: string): number => {
	const value = item[key];
	return typeof value === 'number' ? value : 0;
};

/**
 * @name createStatsRepository
 *
 * @description The statistics repository of proposal §6: one table, atomic counters, no event
 * log. The write is a single TransactWriteItems with two Update ADDs (the global counters and
 * the per-target counter) — both succeed or neither does, so conversionCount can never drift
 * from the sum of the target counters; no read before write. The read is one Query. The client,
 * the table name and the retry delay are injectable for tests.
 *
 * @param {StatsRepositoryDeps} deps optional client/table/delay overrides
 *
 * @returns {StatsRepository} recordConversion and getStats
 */
export const createStatsRepository = (deps?: StatsRepositoryDeps): StatsRepository => {
	const client = deps?.client ?? createDocumentClient();
	const tableName = resolveTableName(deps?.tableName);
	const retryDelayMs = deps?.retryDelayMs ?? WRITE_RETRY_DELAY_MS;

	/**
	 * @name recordConversion
	 *
	 * @description Records one conversion atomically (§6). Retries the whole transaction up to
	 * 3 times with a short backoff; each transient failure logs warn through the REQUEST-SCOPED
	 * logger passed in (the retry lines carry the request id; warn — not debug — stays visible
	 * at the production info level, §9). The final failure throws — the route layer catches it,
	 * logs error and still answers 200 (the conversion never fails because of statistics).
	 *
	 * @param {ConversionRecord} record the target currency and the EUR cents of the conversion
	 * @param {StatsWriteLogger} log the request-scoped logger for the retry warnings
	 *
	 * @returns {Promise<void>} resolves once the counters are written
	 *
	 * @throws {Error} the last transaction error after all the attempts are exhausted
	 */
	const recordConversion: StatsRepository['recordConversion'] = async (record, log) => {
		const command = new TransactWriteCommand({
			TransactItems: [
				{
					Update: {
						TableName: tableName,
						Key: { pk: STATS_PK, sk: GLOBAL_SK },
						UpdateExpression: 'ADD conversionCount :one, totalEurCents :cents',
						ExpressionAttributeValues: { ':one': 1, ':cents': record.amountEurCents },
					},
				},
				{
					Update: {
						TableName: tableName,
						Key: { pk: STATS_PK, sk: `${TARGET_SK_PREFIX}${record.targetCurrency}` },
						// 'count' is a DynamoDB reserved word — hence the attribute name alias
						UpdateExpression: 'ADD #count :one',
						ExpressionAttributeNames: { '#count': 'count' },
						ExpressionAttributeValues: { ':one': 1 },
					},
				},
			],
		});

		for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt += 1) {
			try {
				await client.send(command);
				return;
			} catch (error) {
				if (attempt === WRITE_ATTEMPTS) {
					throw error;
				}
				log.warn(
					{ attempt, attempts: WRITE_ATTEMPTS },
					'statistics write attempt failed — retrying',
				);
				await delay(retryDelayMs);
			}
		}
	};

	/**
	 * @name getStats
	 *
	 * @description Reads the statistics with one Query (§6). The items arrive in ascending
	 * sort-key order (ScanIndexForward defaults to true): GLOBAL first, then TARGET# items in
	 * alphabetical currency order — so one pass with the STRICT > comparison yields the
	 * alphabetically-first winner on ties with no sort. An empty table reports zeros and a null
	 * top currency (the honest empty state).
	 *
	 * @returns {Promise<Stats>} the totals and the top target currency
	 */
	const getStats: StatsRepository['getStats'] = async () => {
		const output = await client.send(
			new QueryCommand({
				TableName: tableName,
				KeyConditionExpression: 'pk = :pk',
				ExpressionAttributeValues: { ':pk': STATS_PK },
			}),
		);

		let totalConversions = 0;
		let totalEurCents = 0;
		let topTargetCurrency: string | null = null;
		let topCount = 0;
		for (const item of output.Items ?? []) {
			const sk = item['sk'];
			if (typeof sk !== 'string') {
				continue;
			}
			if (sk === GLOBAL_SK) {
				totalConversions = readNumber(item, 'conversionCount');
				totalEurCents = readNumber(item, 'totalEurCents');
				continue;
			}
			if (sk.startsWith(TARGET_SK_PREFIX)) {
				const count = readNumber(item, 'count');
				// strict > — the ascending sk order makes the FIRST tied currency win (the tie-break)
				if (count > topCount) {
					topCount = count;
					topTargetCurrency = sk.slice(TARGET_SK_PREFIX.length);
				}
			}
		}
		return { totalConversions, totalAmountEur: totalEurCents / 100, topTargetCurrency };
	};

	return { recordConversion, getStats };
};
