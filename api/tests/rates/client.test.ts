import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fetchLatestRates } from '../../src/rates/client.js';
import { EnvVar } from '../../src/lib/enums.js';
import type { FetchFn } from '../../src/rates/types.js';

const FIXTURE = { rates: { USD: 1, EUR: 0.9, GBP: 0.8 }, timestamp: 1_700_000_000 };

/**
 * @name jsonResponse
 *
 * @description Test helper — a Response carrying the given body as JSON.
 *
 * @param {unknown} body the payload to serve
 *
 * @returns {Response} the response object
 */
const jsonResponse = (body: unknown): Response =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});

let originalKey: string | undefined;

beforeEach(() => {
	originalKey = process.env[EnvVar.OER_API_KEY];
	process.env[EnvVar.OER_API_KEY] = 'test-key';
});

afterEach(() => {
	if (originalKey === undefined) {
		delete process.env[EnvVar.OER_API_KEY];
	} else {
		process.env[EnvVar.OER_API_KEY] = originalKey;
	}
});

describe('fetchLatestRates', () => {
	it('parses a valid OER response', async () => {
		const fetchFn: FetchFn = async () => jsonResponse(FIXTURE);

		const result = await fetchLatestRates({ fetchFn });

		expect(result).toEqual(FIXTURE);
	});

	it('rejects a response with a wrong shape (rule 3 — never assume)', async () => {
		const fetchFn: FetchFn = async () => jsonResponse({ unexpected: true });

		await expect(fetchLatestRates({ fetchFn })).rejects.toThrowError(z.ZodError);
	});

	it('rejects a non-OK status without leaking the URL or the key', async () => {
		const fetchFn: FetchFn = async () => new Response('nope', { status: 503 });

		await expect(fetchLatestRates({ fetchFn })).rejects.toThrowError(
			'Rate provider request failed with status 503',
		);
	});

	it('aborts a hanging fetch after the timeout', async () => {
		const fetchFn: FetchFn = (_input, init) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => {
					reject(new Error('aborted by signal'));
				});
			});

		await expect(fetchLatestRates({ fetchFn, timeoutMs: 10 })).rejects.toThrowError(
			'aborted by signal',
		);
	});

	it('fails clearly when OER_API_KEY is not set', async () => {
		delete process.env[EnvVar.OER_API_KEY];
		const fetchFn: FetchFn = async () => jsonResponse(FIXTURE);

		await expect(fetchLatestRates({ fetchFn })).rejects.toThrowError(
			'OER_API_KEY env variable is not set',
		);
	});
});
