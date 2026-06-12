import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConverterForm } from '../../../src/features/converter/ConverterForm/ConverterForm';
import { ApiError } from '../../../src/api/errors';
import { initI18n } from '../../../src/i18n/setup';
import { CURRENCIES_FIXTURE, TRANSLATIONS_FIXTURE } from '../../helpers/fixtures';

vi.mock('../../../src/api/generated/client', () => ({
	getApiInit: vi.fn(),
	getApiCurrencies: vi.fn(),
	postApiConvert: vi.fn(),
}));

import { postApiConvert } from '../../../src/api/generated/client';

const postApiConvertMock = vi.mocked(postApiConvert);

beforeAll(async () => {
	await initI18n(TRANSLATIONS_FIXTURE, 'en');
});

beforeEach(() => {
	vi.clearAllMocks();
});

/**
 * @name renderForm
 *
 * @description Test helper — renders the converter with the currencies fixture.
 *
 * @returns {void} nothing
 */
const renderForm = (): void => {
	render(<ConverterForm currencies={CURRENCIES_FIXTURE} />);
};

describe('the conversion form', () => {
	it('submits a valid conversion and renders the formatted result', async () => {
		postApiConvertMock.mockResolvedValue({
			amount: 100,
			from: 'EUR',
			to: 'CZK',
			rate: 24.178933,
			result: 2417.89,
			rateTimestamp: '2026-06-12T10:00:00.000Z',
		});
		renderForm();

		await userEvent.type(screen.getByLabelText('Amount to convert'), '100');
		await userEvent.click(screen.getByRole('button', { name: 'Convert currency' }));

		expect(postApiConvertMock).toHaveBeenCalledWith({ amount: 100, from: 'EUR', to: 'CZK' });
		expect(await screen.findByText('2 417,89 CZK')).toBeDefined();
	});

	it('normalizes a comma decimal before the POST', async () => {
		postApiConvertMock.mockResolvedValue({
			amount: 10.5,
			from: 'EUR',
			to: 'CZK',
			rate: 24,
			result: 252,
			rateTimestamp: '2026-06-12T10:00:00.000Z',
		});
		renderForm();

		await userEvent.type(screen.getByLabelText('Amount to convert'), '10,50');
		await userEvent.click(screen.getByRole('button', { name: 'Convert currency' }));

		expect(postApiConvertMock).toHaveBeenCalledWith({ amount: 10.5, from: 'EUR', to: 'CZK' });
	});

	it('keeps Convert disabled for an invalid amount (3 decimals) — nothing is posted', async () => {
		renderForm();

		await userEvent.type(screen.getByLabelText('Amount to convert'), '1.005');

		const button = screen.getByRole('button', { name: 'Convert currency' });
		expect(button.hasAttribute('disabled')).toBe(true);
		await userEvent.click(button);
		expect(postApiConvertMock).not.toHaveBeenCalled();
	});

	it('renders an API error translated by its key with its params', async () => {
		postApiConvertMock.mockRejectedValue(
			new ApiError(
				'UNSUPPORTED_CURRENCY',
				'errors.unsupportedCurrency',
				'Currency XYZ is not supported',
				{ code: 'XYZ' },
				422,
			),
		);
		renderForm();

		await userEvent.type(screen.getByLabelText('Amount to convert'), '5');
		await userEvent.click(screen.getByRole('button', { name: 'Convert currency' }));

		expect(await screen.findByRole('alert')).toBeDefined();
		expect(screen.getByRole('alert').textContent).toBe('Currency XYZ is not supported');
	});

	it('keeps the Result space reserved before the first conversion', () => {
		renderForm();

		expect(screen.getByText('Result')).toBeDefined();
		expect(screen.getByText('—')).toBeDefined();
	});
});

describe('the currency combobox (§10)', () => {
	it('filters by typing and selects with Enter', async () => {
		renderForm();
		const toSelect = screen.getByLabelText('To');

		await userEvent.click(toSelect);
		await userEvent.type(toSelect, 'pound');
		await userEvent.keyboard('{Enter}');

		expect(screen.getByLabelText('To').getAttribute('value')).toBe('GBP');
	});

	it('navigates with the arrows', async () => {
		renderForm();
		const toSelect = screen.getByLabelText('To');

		await userEvent.click(toSelect);
		// the list (without the excluded EUR): CZK, GBP, USD — two downs land on USD... the
		// first down moves from index 0 (CZK) to 1 (GBP), the second to 2 (USD)
		await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');

		expect(screen.getByLabelText('To').getAttribute('value')).toBe('USD');
	});

	it('closes on Escape without changing the value', async () => {
		renderForm();
		const toSelect = screen.getByLabelText('To');

		await userEvent.click(toSelect);
		expect(screen.getByRole('listbox')).toBeDefined();
		await userEvent.keyboard('{Escape}');

		expect(screen.queryByRole('listbox')).toBeNull();
		expect(screen.getByLabelText('To').getAttribute('value')).toBe('CZK');
	});

	it('EXCLUDES the currency chosen on the other side — EUR is not offered as a target', async () => {
		renderForm();

		await userEvent.click(screen.getByLabelText('To'));

		const options = screen.getAllByRole('option').map((option) => option.textContent);
		expect(options.some((text) => text?.startsWith('EUR'))).toBe(false);
		expect(options.some((text) => text?.startsWith('CZK'))).toBe(true);
	});
});
