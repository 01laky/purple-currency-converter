import type { RatesProvider } from '../rates/types.js';
import type { StatsRepository } from '../stats/types.js';
import type { ErrorCode } from './enums.js';

export type ErrorParams = Record<string, string | number>;

export type BuildAppDeps = {
	ratesProvider?: RatesProvider;
	statsRepository?: StatsRepository;
	// the DI seam for the 429 tests (prompt v0.11.0): a low max keeps the test at a handful of
	// requests on its own app instance instead of sixty-one against the shared suite window
	rateLimitMax?: number;
};

export type ApiErrorBody = {
	error: {
		code: ErrorCode;
		key: string;
		message: string;
		params?: ErrorParams;
	};
};
