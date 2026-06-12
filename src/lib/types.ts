import type { RatesProvider } from '../rates/types.js';
import type { ErrorCode } from './enums.js';

export type ErrorParams = Record<string, string | number>;

export type BuildAppDeps = {
	ratesProvider?: RatesProvider;
};

export type ApiErrorBody = {
	error: {
		code: ErrorCode;
		key: string;
		message: string;
		params?: ErrorParams;
	};
};
