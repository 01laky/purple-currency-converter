import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export type ConversionRecord = {
	targetCurrency: string;
	amountEurCents: number;
};

export type Stats = {
	totalConversions: number;
	totalAmountEur: number;
	topTargetCurrency: string | null;
};

// The request-scoped logger of the handler — the repository has none of its own; passing it in
// is how the retry warn lines carry the request id (prompt v0.6.0)
export type StatsWriteLogger = {
	warn: (data: Record<string, unknown>, message: string) => void;
};

export type StatsRepositoryDeps = {
	client?: DynamoDBDocumentClient;
	tableName?: string;
	retryDelayMs?: number;
};

export type StatsRepository = {
	recordConversion: (record: ConversionRecord, log: StatsWriteLogger) => Promise<void>;
	getStats: () => Promise<Stats>;
};
