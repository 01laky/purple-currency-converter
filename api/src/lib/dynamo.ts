import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { LOCAL_DYNAMO_CREDENTIALS, LOCAL_DYNAMO_REGION } from './constants.js';
import { EnvVar } from './enums.js';

/**
 * @name resolveEndpoint
 *
 * @description Reads DYNAMO_ENDPOINT from the environment; an empty value counts as unset so
 * that a blank .env line keeps the AWS mode.
 *
 * @param {string | undefined} fallback endpoint used when the environment does not provide one
 *
 * @returns {string | undefined} the endpoint to use, or undefined for the AWS mode
 */
const resolveEndpoint = (fallback?: string): string | undefined => {
	const fromEnv = process.env[EnvVar.DYNAMO_ENDPOINT];
	if (fromEnv !== undefined && fromEnv !== '') {
		return fromEnv;
	}
	return fallback;
};

/**
 * @name createDynamoClient
 *
 * @description Creates the base DynamoDB client. With an endpoint (DYNAMO_ENDPOINT or the
 * explicit fallback) it targets dynamodb-local with dummy credentials; without one it relies
 * on the AWS runtime (region and credentials supplied by Lambda).
 *
 * @param {string | undefined} fallbackEndpoint endpoint used when DYNAMO_ENDPOINT is not set
 *
 * @returns {DynamoDBClient} the configured low-level client
 */
export const createDynamoClient = (fallbackEndpoint?: string): DynamoDBClient => {
	const endpoint = resolveEndpoint(fallbackEndpoint);
	if (endpoint === undefined) {
		return new DynamoDBClient({});
	}
	return new DynamoDBClient({
		endpoint,
		region: LOCAL_DYNAMO_REGION,
		credentials: LOCAL_DYNAMO_CREDENTIALS,
	});
};

/**
 * @name createDocumentClient
 *
 * @description Creates the DynamoDB Document client wrapping the base client; the single entry
 * point for all item-level access (CLAUDE.md, Architecture).
 *
 * @param {string | undefined} fallbackEndpoint endpoint used when DYNAMO_ENDPOINT is not set
 *
 * @returns {DynamoDBDocumentClient} the configured document client
 */
export const createDocumentClient = (fallbackEndpoint?: string): DynamoDBDocumentClient =>
	DynamoDBDocumentClient.from(createDynamoClient(fallbackEndpoint));
