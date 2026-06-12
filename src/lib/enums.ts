export enum ErrorCode {
	VALIDATION_ERROR = 'VALIDATION_ERROR',
	NOT_FOUND = 'NOT_FOUND',
	INTERNAL_ERROR = 'INTERNAL_ERROR',
	RATE_PROVIDER_ERROR = 'RATE_PROVIDER_ERROR',
	UNSUPPORTED_CURRENCY = 'UNSUPPORTED_CURRENCY',
}

export enum ErrorKey {
	NOT_FOUND = 'errors.notFound',
	INTERNAL = 'errors.internal',
	RATE_PROVIDER = 'errors.rateProvider',
	UNSUPPORTED_CURRENCY = 'errors.unsupportedCurrency',
	VALIDATION_INVALID_REQUEST = 'errors.validation.invalidRequest',
	VALIDATION_AMOUNT_NOT_POSITIVE = 'errors.validation.amountNotPositive',
	VALIDATION_AMOUNT_TOO_LARGE = 'errors.validation.amountTooLarge',
	VALIDATION_AMOUNT_TOO_MANY_DECIMALS = 'errors.validation.amountTooManyDecimals',
	VALIDATION_INVALID_CURRENCY_CODE = 'errors.validation.invalidCurrencyCode',
	VALIDATION_SAME_CURRENCY = 'errors.validation.sameCurrency',
}

export enum EnvVar {
	PORT = 'PORT',
	DYNAMO_ENDPOINT = 'DYNAMO_ENDPOINT',
	STATS_TABLE = 'STATS_TABLE',
	OER_API_KEY = 'OER_API_KEY',
	NODE_ENV = 'NODE_ENV',
}
