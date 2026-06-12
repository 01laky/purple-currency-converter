import type { ErrorCode } from './enums.js';

export type ErrorParams = Record<string, string | number>;

export type ApiErrorBody = {
	error: {
		code: ErrorCode;
		key: string;
		message: string;
		params?: ErrorParams;
	};
};
