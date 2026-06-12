import type { GetApiInit200 } from '../../src/api/generated/model';

// the test translation fixture — the §3 catalog subset the tests touch
export const TRANSLATIONS_FIXTURE = {
	en: {
		errors: {
			internal: 'Internal server error',
			network: 'Connection failed — please check your network',
			rateProvider: 'Exchange rate provider is unavailable',
			unsupportedCurrency: 'Currency {{code}} is not supported',
			validation: {
				invalidRequest: 'Invalid request',
				amountNotPositive: 'Amount must be a positive number',
				sameCurrency: 'Source and target currencies must be different',
			},
		},
		ui: {
			title: 'Purple currency converter',
			amountToConvert: 'Amount to convert',
			from: 'From',
			to: 'To',
			convertCurrency: 'Convert currency',
			result: 'Result',
			numberOfCalculations: 'Number of calculations made',
			topTargetCurrency: 'Top target currency',
			totalAmountEur: 'Total amount in EUR',
			retry: 'Try again',
		},
	},
	cs: {
		errors: {
			internal: 'Interní chyba serveru',
			network: 'Připojení selhalo — zkontrolujte prosím síť',
			rateProvider: 'Poskytovatel směnných kurzů je nedostupný',
			unsupportedCurrency: 'Měna {{code}} není podporována',
			validation: {
				invalidRequest: 'Neplatný požadavek',
				amountNotPositive: 'Částka musí být kladné číslo',
				sameCurrency: 'Zdrojová a cílová měna se musí lišit',
			},
		},
		ui: {
			title: 'Purple převodník měn',
			amountToConvert: 'Částka k převodu',
			from: 'Z',
			to: 'Na',
			convertCurrency: 'Převést měnu',
			result: 'Výsledek',
			numberOfCalculations: 'Počet provedených výpočtů',
			topTargetCurrency: 'Nejčastější cílová měna',
			totalAmountEur: 'Celková částka v EUR',
			retry: 'Zkusit znovu',
		},
	},
	sk: {
		errors: {
			internal: 'Interná chyba servera',
			network: 'Pripojenie zlyhalo — skontrolujte prosím sieť',
			rateProvider: 'Poskytovateľ výmenných kurzov je nedostupný',
			unsupportedCurrency: 'Mena {{code}} nie je podporovaná',
			validation: {
				invalidRequest: 'Neplatná požiadavka',
				amountNotPositive: 'Suma musí byť kladné číslo',
				sameCurrency: 'Zdrojová a cieľová mena sa musia líšiť',
			},
		},
		ui: {
			title: 'Purple prevodník mien',
			amountToConvert: 'Suma na prevod',
			from: 'Z',
			to: 'Na',
			convertCurrency: 'Previesť menu',
			result: 'Výsledok',
			numberOfCalculations: 'Počet vykonaných výpočtov',
			topTargetCurrency: 'Najčastejšia cieľová mena',
			totalAmountEur: 'Celková suma v EUR',
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
