export type Clock = () => number;

export type FetchFn = typeof globalThis.fetch;

export type OerLatestRates = {
	rates: Record<string, number>;
	timestamp: number;
};

export type CachedValue<T> = {
	value: T;
	fetchedAt: number;
	stale: boolean;
};

export type CachedSourceOptions<T> = {
	fetchFn: () => Promise<T>;
	ttlMs: number;
	now: Clock;
};

export type CachedSource<T> = {
	get: () => Promise<CachedValue<T>>;
	ageSeconds: () => number | null;
};

export type FetchLatestRatesDeps = {
	fetchFn?: FetchFn;
	timeoutMs?: number;
};

export type RatesProviderDeps = {
	now?: Clock;
	client?: FetchLatestRatesDeps;
};

export type RateQuote = {
	rate: number;
	rateTimestamp: string;
};

export type RatesProvider = {
	getRate: (from: string, to: string) => Promise<RateQuote>;
	getSupportedCurrencies: () => Promise<string[]>;
	getCacheAgeSeconds: () => number | null;
};
