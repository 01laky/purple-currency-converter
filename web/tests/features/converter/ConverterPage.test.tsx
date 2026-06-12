import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConverterPage } from '../../../src/features/converter/ConverterPage/ConverterPage';
import { ApiError } from '../../../src/api/errors';
import { initI18n } from '../../../src/i18n/setup';
import { CURRENCIES_FIXTURE, TRANSLATIONS_FIXTURE } from '../../helpers/fixtures';

vi.mock('../../../src/api/generated/client', () => ({
	getApiInit: vi.fn(),
	getApiCurrencies: vi.fn(),
	postApiConvert: vi.fn(),
	getApiStats: vi.fn(),
}));

import { getApiStats, postApiConvert } from '../../../src/api/generated/client';

const getApiStatsMock = vi.mocked(getApiStats);
const postApiConvertMock = vi.mocked(postApiConvert);

const LANGUAGES = ['en', 'cs', 'sk'];

const STATS_FIXTURE = {
	totalConversions: 1234567,
	totalAmountEur: 12345.67,
	topTargetCurrency: 'CZK',
};

const CONVERSION_FIXTURE = {
	amount: 100,
	from: 'EUR',
	to: 'CZK',
	rate: 24.17,
	result: 2417,
	rateTimestamp: '2026-06-12T10:00:00.000Z',
};

beforeAll(async () => {
	await initI18n(TRANSLATIONS_FIXTURE, 'en');
});

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	getApiStatsMock.mockResolvedValue(STATS_FIXTURE);
});

/**
 * @name renderPage
 *
 * @description Test helper — renders the page with the fixtures.
 *
 * @returns {void} nothing
 */
const renderPage = (): void => {
	render(<ConverterPage currencies={CURRENCIES_FIXTURE} languages={LANGUAGES} />);
};

describe('the statistics in the Result card (§10)', () => {
	it('renders the three statistics in the fixed formats', async () => {
		renderPage();

		expect(await screen.findByText('1 234 567')).toBeDefined();
		expect(screen.getByText('12 345,67 EUR')).toBeDefined();
		expect(screen.getByText('CZK')).toBeDefined();
	});

	it('renders the honest empty state at zero conversions', async () => {
		getApiStatsMock.mockResolvedValue({
			totalConversions: 0,
			totalAmountEur: 0,
			topTargetCurrency: null,
		});
		renderPage();

		expect(await screen.findByText('0')).toBeDefined();
		expect(screen.getByText('0,00 EUR')).toBeDefined();
		expect(screen.getAllByText('—').length).toBeGreaterThan(0);
	});

	it('renders dashes on a stats fetch failure — the converter never blocks', async () => {
		getApiStatsMock.mockRejectedValue(new ApiError('NETWORK_ERROR', 'errors.network', 'down'));
		renderPage();

		await waitFor(() => expect(getApiStatsMock).toHaveBeenCalled());
		expect(screen.getAllByText('—').length).toBeGreaterThan(1);
		expect(screen.getByLabelText('Amount to convert')).toBeDefined();
	});

	it('refreshes after every successful conversion — the persistence live', async () => {
		postApiConvertMock.mockResolvedValue(CONVERSION_FIXTURE);
		renderPage();
		await waitFor(() => expect(getApiStatsMock).toHaveBeenCalledTimes(1));

		await userEvent.type(screen.getByLabelText('Amount to convert'), '100');
		await userEvent.click(screen.getByRole('button', { name: 'Convert currency' }));

		await waitFor(() => expect(getApiStatsMock).toHaveBeenCalledTimes(2));
	});
});

describe('the language changer (§10, the 0.10.0 placement)', () => {
	it('switches the texts instantly, persists and updates <html lang>', async () => {
		renderPage();

		await userEvent.click(screen.getByRole('button', { name: 'SK' }));

		expect(screen.getByRole('heading', { name: 'Purple prevodník mien' })).toBeDefined();
		expect(localStorage.getItem('language')).toBe('sk');
		expect(document.documentElement.lang).toBe('sk');

		// back to EN for the following tests
		await userEvent.click(screen.getByRole('button', { name: 'EN' }));
	});
});

describe('the form defaults (the 0.10.0 decision)', () => {
	it('pre-fills 0/EUR/CZK and keeps Convert DISABLED at the pristine default', () => {
		renderPage();

		// the rhf input is uncontrolled — the default lives in the DOM property, not the attribute
		expect(screen.getByLabelText<HTMLInputElement>('Amount to convert').value).toBe('0');
		expect(screen.getByLabelText<HTMLInputElement>('From').value).toBe('EUR');
		expect(screen.getByLabelText<HTMLInputElement>('To').value).toBe('CZK');
		expect(screen.getByRole('button', { name: 'Convert currency' }).hasAttribute('disabled')).toBe(
			true,
		);
	});

	it('selects the whole 0 on focus — the first keystroke replaces it', async () => {
		renderPage();
		const amount = screen.getByLabelText<HTMLInputElement>('Amount to convert');

		await userEvent.click(amount);
		await userEvent.keyboard('100');

		expect(amount.value).toBe('100');
		expect(screen.getByRole('button', { name: 'Convert currency' }).hasAttribute('disabled')).toBe(
			false,
		);
	});
});

describe('the in-flight announcement and the error placements (§10)', () => {
	it('the pending button is disabled, aria-busy and carries the status spinner', async () => {
		postApiConvertMock.mockImplementation(
			() =>
				new Promise(() => {
					// never resolves — the in-flight state stays observable
				}),
		);
		renderPage();

		await userEvent.type(screen.getByLabelText('Amount to convert'), '100');
		await userEvent.click(screen.getByRole('button', { name: 'Convert currency' }));

		const button = screen.getByRole('button', { name: 'Convert currency' });
		expect(button.getAttribute('aria-busy')).toBe('true');
		expect(button.hasAttribute('disabled')).toBe(true);
		expect(button.querySelector('[role="status"]')).not.toBeNull();
	});

	it('renders an upstream failure as the page-level banner — OUTSIDE the form', async () => {
		postApiConvertMock.mockRejectedValue(
			new ApiError('RATE_PROVIDER_ERROR', 'errors.rateProvider', 'down', undefined, 502),
		);
		renderPage();

		await userEvent.type(screen.getByLabelText('Amount to convert'), '100');
		await userEvent.click(screen.getByRole('button', { name: 'Convert currency' }));

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toBe('Exchange rate provider is unavailable');
		expect(alert.closest('form')).toBeNull();
	});

	it('renders a sameCurrency 400 INSIDE the form, away from the amount field', async () => {
		postApiConvertMock.mockRejectedValue(
			new ApiError('VALIDATION_ERROR', 'errors.validation.sameCurrency', 'same', undefined, 400),
		);
		renderPage();

		await userEvent.type(screen.getByLabelText('Amount to convert'), '100');
		await userEvent.click(screen.getByRole('button', { name: 'Convert currency' }));

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toBe('Source and target currencies must be different');
		expect(alert.closest('form')).not.toBeNull();
		// NOT in the amount field container — the selects placement renders under the fields row
		const amountField = screen.getByLabelText('Amount to convert').parentElement;
		expect(alert.parentElement).not.toBe(amountField);
	});

	it('renders an amount 400 at the amount field', async () => {
		postApiConvertMock.mockRejectedValue(
			new ApiError(
				'VALIDATION_ERROR',
				'errors.validation.amountNotPositive',
				'not positive',
				undefined,
				400,
			),
		);
		renderPage();

		await userEvent.type(screen.getByLabelText('Amount to convert'), '100');
		await userEvent.click(screen.getByRole('button', { name: 'Convert currency' }));

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toBe('Amount must be a positive number');
		expect(alert.parentElement?.querySelector('#amount')).not.toBeNull();
	});
});
