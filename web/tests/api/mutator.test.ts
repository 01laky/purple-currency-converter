import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	vi.resetModules();
});

describe('the mutator base URL — the explicit ?? fallback (prompt v0.9.0)', () => {
	it('uses the empty string when VITE_API_URL is unset — the same-origin production semantics', async () => {
		// stub to undefined explicitly: a developer's local web/.env would otherwise leak into
		// import.meta.env and make this test environment-dependent (found at 0.10.0)
		vi.stubEnv('VITE_API_URL', undefined);
		vi.resetModules();
		const { apiInstance } = await import('../../src/api/mutator');
		const requestSpy = vi.spyOn(axios, 'request').mockResolvedValue({ data: { ok: true } });

		await apiInstance({ url: '/health', method: 'GET' });

		expect(requestSpy.mock.calls[0]?.[0]?.baseURL).toBe('');
	});

	it('uses VITE_API_URL when set — the local cross-origin dev', async () => {
		vi.stubEnv('VITE_API_URL', 'http://localhost:3000');
		vi.resetModules();
		const { apiInstance } = await import('../../src/api/mutator');
		const requestSpy = vi.spyOn(axios, 'request').mockResolvedValue({ data: { ok: true } });

		await apiInstance({ url: '/health', method: 'GET' });

		expect(requestSpy.mock.calls[0]?.[0]?.baseURL).toBe('http://localhost:3000');
	});

	it('maps a unified error body onto ApiError — components never see a raw AxiosError', async () => {
		vi.resetModules();
		const { apiInstance } = await import('../../src/api/mutator');
		const { ApiError } = await import('../../src/api/errors');
		vi.spyOn(axios, 'request').mockRejectedValue(
			new axios.AxiosError('Request failed', '422', undefined, undefined, {
				status: 422,
				statusText: 'Unprocessable Entity',
				headers: {},
				config: { headers: new axios.AxiosHeaders() },
				data: {
					error: {
						code: 'UNSUPPORTED_CURRENCY',
						key: 'errors.unsupportedCurrency',
						message: 'Currency XYZ is not supported',
						params: { code: 'XYZ' },
					},
				},
			}),
		);

		const failure = apiInstance({ url: '/api/convert', method: 'POST' });

		await expect(failure).rejects.toBeInstanceOf(ApiError);
		await expect(failure).rejects.toMatchObject({
			code: 'UNSUPPORTED_CURRENCY',
			key: 'errors.unsupportedCurrency',
			params: { code: 'XYZ' },
			status: 422,
		});
	});

	// additive at v0.11.0 (the edge-case pass): the NON-unified fallback path was untested —
	// a gateway HTML page, a timeout, a dead socket must all become the synthetic NETWORK_ERROR
	// with the errors.network key (the catalog key added at v0.10.0), never a raw axios error
	it('maps a NON-unified error payload (a gateway HTML page) onto the synthetic NETWORK_ERROR', async () => {
		vi.resetModules();
		const { apiInstance } = await import('../../src/api/mutator');
		const { ApiError } = await import('../../src/api/errors');
		vi.spyOn(axios, 'request').mockRejectedValue(
			new axios.AxiosError('Request failed', '503', undefined, undefined, {
				status: 503,
				statusText: 'Service Unavailable',
				headers: {},
				config: { headers: new axios.AxiosHeaders() },
				data: '<html><body>503 Service Unavailable</body></html>',
			}),
		);

		const failure = apiInstance({ url: '/api/convert', method: 'POST' });

		await expect(failure).rejects.toBeInstanceOf(ApiError);
		await expect(failure).rejects.toMatchObject({
			code: 'NETWORK_ERROR',
			key: 'errors.network',
		});
	});

	it('maps a transportless failure (no response at all) onto the synthetic NETWORK_ERROR', async () => {
		vi.resetModules();
		const { apiInstance } = await import('../../src/api/mutator');
		const { ApiError } = await import('../../src/api/errors');
		vi.spyOn(axios, 'request').mockRejectedValue(
			new axios.AxiosError('timeout of 10000ms exceeded', 'ECONNABORTED'),
		);

		const failure = apiInstance({ url: '/api/stats', method: 'GET' });

		await expect(failure).rejects.toBeInstanceOf(ApiError);
		await expect(failure).rejects.toMatchObject({
			code: 'NETWORK_ERROR',
			key: 'errors.network',
		});
	});
});
