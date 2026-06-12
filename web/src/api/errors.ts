import type { ApiErrorParams } from './types';

/**
 * @name ApiError
 *
 * @description The only error shape components ever see (proposal §10): the §3 unified body
 * mapped onto a typed error — the code for programmatic branching, the key for the i18n
 * translation, the params for interpolation. A raw AxiosError never escapes the mutator.
 */
export class ApiError extends Error {
	readonly code: string;
	readonly key: string;
	readonly params?: ApiErrorParams;
	readonly status?: number;

	/**
	 * @name constructor
	 *
	 * @description Creates the typed API error.
	 *
	 * @param {string} code the programmatic error code (the §3 catalog or NETWORK_ERROR)
	 * @param {string} key the i18n key translatable via /api/init
	 * @param {string} message the English message (never displayed — the key is translated)
	 * @param {ApiErrorParams | undefined} params interpolation values
	 * @param {number | undefined} status the HTTP status when one exists
	 *
	 * @returns {ApiError} the error instance
	 */
	constructor(
		code: string,
		key: string,
		message: string,
		params?: ApiErrorParams,
		status?: number,
	) {
		super(message);
		this.name = 'ApiError';
		this.code = code;
		this.key = key;
		this.params = params;
		this.status = status;
	}
}
