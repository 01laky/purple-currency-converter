import type { GetApiInit200 } from '../../src/api/generated/model';

// the test translation fixture — the §3 catalog subset the tests touch
export const TRANSLATIONS_FIXTURE = {
	en: {
		errors: {
			internal: 'Internal server error',
			unsupportedCurrency: 'Currency {{code}} is not supported',
			validation: { invalidRequest: 'Invalid request' },
		},
		ui: {
			title: 'Purple currency converter',
			amountToConvert: 'Amount to convert',
			from: 'From',
			to: 'To',
			convertCurrency: 'Convert currency',
			result: 'Result',
			retry: 'Try again',
		},
	},
	cs: {
		errors: {
			internal: 'Interní chyba serveru',
			unsupportedCurrency: 'Měna {{code}} není podporována',
			validation: { invalidRequest: 'Neplatný požadavek' },
		},
		ui: {
			title: 'Purple převodník měn',
			amountToConvert: 'Částka k převodu',
			from: 'Z',
			to: 'Na',
			convertCurrency: 'Převést měnu',
			result: 'Výsledek',
			retry: 'Zkusit znovu',
		},
	},
	sk: {
		errors: {
			internal: 'Interná chyba servera',
			unsupportedCurrency: 'Mena {{code}} nie je podporovaná',
			validation: { invalidRequest: 'Neplatná požiadavka' },
		},
		ui: {
			title: 'Purple prevodník mien',
			amountToConvert: 'Suma na prevod',
			from: 'Z',
			to: 'Na',
			convertCurrency: 'Previesť menu',
			result: 'Výsledok',
			retry: 'Skúsiť znova',
		},
	},
};

export const CURRENCIES_FIXTURE = {
	CZK: 'Czech Republic Koruna',
	EUR: 'Euro',
	GBP: 'British Pound Sterling',
	USD: 'United States Dollar',
};

export const INIT_FIXTURE: GetApiInit200 = {
	languages: ['en', 'cs', 'sk'],
	translations: TRANSLATIONS_FIXTURE,
};
