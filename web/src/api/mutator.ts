import axios, { AxiosError } from 'axios';
import type { AxiosRequestConfig } from 'axios';
import { NETWORK_ERROR_CODE, NETWORK_ERROR_KEY, REQUEST_TIMEOUT_MS } from './constants';
import { ApiError } from './errors';
import type { ApiErrorBody } from './types';

// The fallback is EXPLICIT and load-bearing (prompt v0.9.0): the CI vite build has no .env,
// the env is undefined and Vite reports nothing — the empty string IS the §10 production
// semantics: same-origin relative calls through the Router (0.10.0).
const baseURL: string = import.meta.env.VITE_API_URL ?? '';

/**
 * @name isApiErrorBody
 *
 * @description Type guard for the §3 unified error body in an error response payload.
 *
 * @param {unknown} payload the response data
 *
 * @returns {boolean} true when the payload carries the unified error shape
 */
const isApiErrorBody = (payload: unknown): payload is ApiErrorBody => {
	if (typeof payload !== 'object' || payload === null || !('error' in payload)) {
		return false;
	}
	const inner: unknown = payload.error;
	return (
		typeof inner === 'object' &&
		inner !== null &&
		'code' in inner &&
		'key' in inner &&
		typeof inner.code === 'string' &&
		typeof inner.key === 'string'
	);
};

/**
 * @name toApiError
 *
 * @description Maps any transport failure onto the typed ApiError (proposal §10): a response
 * carrying the §3 unified body keeps its code/key/params; everything else (a timeout, a
 * network failure, an unexpected payload) becomes the synthetic NETWORK_ERROR with the
 * errors.network key (the catalog key added at v0.10.0) — translated like every other text,
 * no raw axios internals.
 *
 * @param {unknown} error the caught error
 *
 * @returns {ApiError} the typed error
 */
const toApiError = (error: unknown): ApiError => {
	if (error instanceof AxiosError && isApiErrorBody(error.response?.data)) {
		const body = error.response.data.error;
		return new ApiError(body.code, body.key, body.message, body.params, error.response.status);
	}
	const message = error instanceof Error ? error.message : 'Network request failed';
	return new ApiError(NETWORK_ERROR_CODE, NETWORK_ERROR_KEY, message);
};

/**
 * @name apiInstance
 *
 * @description The orval mutator — the single HTTP layer of the frontend (proposal §10):
 * every generated call flows through here; the base URL, the client-side timeout and the
 * error mapping live in exactly one place. Components never see a raw AxiosError.
 *
 * @param {AxiosRequestConfig} config the request configuration from the generated client
 *
 * @returns {Promise<T>} the response data
 *
 * @throws {ApiError} the typed error for any failure
 */
export const apiInstance = async <T>(config: AxiosRequestConfig): Promise<T> => {
	try {
		const response = await axios.request<T>({ baseURL, timeout: REQUEST_TIMEOUT_MS, ...config });
		return response.data;
	} catch (error) {
		throw toApiError(error);
	}
};
