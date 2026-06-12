export enum ErrorCode {
	VALIDATION_ERROR = 'VALIDATION_ERROR',
	NOT_FOUND = 'NOT_FOUND',
	INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export enum ErrorKey {
	NOT_FOUND = 'errors.notFound',
	INTERNAL = 'errors.internal',
	VALIDATION_INVALID_REQUEST = 'errors.validation.invalidRequest',
}

export enum EnvVar {
	PORT = 'PORT',
	DYNAMO_ENDPOINT = 'DYNAMO_ENDPOINT',
	STATS_TABLE = 'STATS_TABLE',
	NODE_ENV = 'NODE_ENV',
}
