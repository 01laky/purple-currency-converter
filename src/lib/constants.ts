import { ErrorKey } from './enums.js';

export const DEFAULT_PORT = 3000;

export const LOCAL_DYNAMO_ENDPOINT = 'http://localhost:8002';

export const LOCAL_DYNAMO_REGION = 'local';

export const LOCAL_DYNAMO_CREDENTIALS: { accessKeyId: string; secretAccessKey: string } = {
	accessKeyId: 'local',
	secretAccessKey: 'local',
};

export const DEFAULT_STATS_TABLE = 'ConversionStats';

// English messages of the error keys; the i18n files take over as the source in v0.2.0.
export const ENGLISH_MESSAGES: Readonly<Record<ErrorKey, string>> = {
	[ErrorKey.NOT_FOUND]: 'Resource not found',
	[ErrorKey.INTERNAL]: 'Internal server error',
	[ErrorKey.VALIDATION_INVALID_REQUEST]: 'Invalid request',
};
