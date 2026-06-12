export type Clock = () => number;

export type FetchFn = typeof globalThis.fetch;

export type OerLatestRates = {
	rates: Record<string, number>;
	timestamp: number;
};

export type CurrencyNames = Record<string, string>;

export type CachedValue<T> = {
	value: T;
	fetchedAt: number;
	stale: boolean;
};

export type CachedSourceOptions<T> = {
	fetchFn: () => Promise<T>;
	ttlMs: number;
	now: Clock;
	// the stale fallback is by design (§4), but it must not be SILENT (rule 24, v0.11.0):
	// the owner observes every refresh failure that was absorbed by serving the stale copy
	onStaleServed?: (error: unknown) => void;
};

export type CachedSource<T> = {
	get: () => Promise<CachedValue<T>>;
	ageSeconds: () => number | null;
};

export type OerClientDeps = {
	fetchFn?: FetchFn;
	timeoutMs?: number;
};

// The same structural shape as the stats StatsWriteLogger — a Fastify logger satisfies it
export type StaleWarnLogger = {
	warn: (data: Record<string, unknown>, message: string) => void;
};

export type RatesProviderDeps = {
	now?: Clock;
	client?: OerClientDeps;
	logger?: StaleWarnLogger;
};

export type RateQuote = {
	rate: number;
	rateTimestamp: string;
};

export type RatesProvider = {
	getRate: (from: string, to: string) => Promise<RateQuote>;
	getSupportedCurrencies: () => Promise<string[]>;
	getCurrencies: () => Promise<CurrencyNames>;
	getCacheAgeSeconds: () => number | null;
};
