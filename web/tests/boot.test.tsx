import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { ApiError } from '../src/api/errors';
import { CURRENCIES_FIXTURE, INIT_FIXTURE } from './helpers/fixtures';

vi.mock('../src/api/generated/client', () => ({
	getApiInit: vi.fn(),
	getApiCurrencies: vi.fn(),
	postApiConvert: vi.fn(),
	// the page fetches the statistics on mount since 0.10.0 — the harness must answer
	getApiStats: vi.fn(async () => ({
		totalConversions: 0,
		totalAmountEur: 0,
		topTargetCurrency: null,
	})),
}));

import { getApiCurrencies, getApiInit } from '../src/api/generated/client';

const getApiInitMock = vi.mocked(getApiInit);
const getApiCurrenciesMock = vi.mocked(getApiCurrencies);

beforeEach(() => {
	vi.clearAllMocks();
});

describe('the boot (§10)', () => {
	it('shows the spinner, then the app once init AND currencies resolve', async () => {
		getApiInitMock.mockResolvedValue(INIT_FIXTURE);
		getApiCurrenciesMock.mockResolvedValue({ currencies: CURRENCIES_FIXTURE });

		render(<App />);

		expect(screen.getByRole('status')).toBeDefined();
		expect(await screen.findByRole('heading', { name: 'Purple currency converter' })).toBeDefined();
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('shows the single hardcoded fallback when init fails', async () => {
		getApiInitMock.mockRejectedValue(
			new ApiError('NETWORK_ERROR', 'errors.internal', 'API unreachable'),
		);

		render(<App />);

		expect(await screen.findByText('Failed to load application')).toBeDefined();
		expect(getApiCurrenciesMock).not.toHaveBeenCalled();
	});

	it('offers a translated retry on a currencies failure — and the retry recovers', async () => {
		getApiInitMock.mockResolvedValue(INIT_FIXTURE);
		getApiCurrenciesMock
			.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', 'errors.internal', 'down'))
			.mockResolvedValueOnce({ currencies: CURRENCIES_FIXTURE });

		render(<App />);

		const retryButton = await screen.findByRole('button', { name: 'Try again' });
		await userEvent.click(retryButton);

		expect(await screen.findByRole('heading', { name: 'Purple currency converter' })).toBeDefined();
	});
});
