import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getApiCurrencies, getApiInit } from '../api/generated/client';
import type { GetApiCurrencies200Currencies } from '../api/generated/model';
import { LANGUAGE_STORAGE_KEY } from '../i18n/constants';
import { resolveLanguage } from '../i18n/resolveLanguage';
import { initI18n } from '../i18n/setup';

export type BootState =
	| { status: 'loading' }
	| { status: 'init-failed' }
	| { status: 'currencies-failed' }
	| { status: 'ready'; currencies: GetApiCurrencies200Currencies };

export type BootContextValue = {
	state: BootState;
	retryCurrencies: () => void;
};

const BootContext = createContext<BootContextValue | null>(null);

/**
 * @name useBoot
 *
 * @description Accessor of the boot context — the app cannot render outside the provider.
 *
 * @returns {BootContextValue} the boot state and the currencies retry action
 *
 * @throws {Error} when used outside BootProvider
 */
export const useBoot = (): BootContextValue => {
	const value = useContext(BootContext);
	if (value === null) {
		throw new Error('useBoot must be used inside BootProvider');
	}
	return value;
};

/**
 * @name BootProvider
 *
 * @description The §10 app boot: a full-page phase until GET /api/init AND /api/currencies
 * resolve. An init failure is terminal (the single hardcoded fallback renders); a currencies
 * failure is retryable without refetching the texts. The texts and the currencies stay in
 * context for the whole session; i18next initializes exactly once (the ref guards the
 * StrictMode double-effect).
 *
 * @param {{ children: ReactNode }} props the subtree rendered under the context
 *
 * @returns {JSX.Element} the provider element
 */
export const BootProvider = ({ children }: { children: ReactNode }) => {
	const [state, setState] = useState<BootState>({ status: 'loading' });
	const i18nStarted = useRef(false);

	const loadCurrencies = useCallback(async (): Promise<void> => {
		try {
			const { currencies } = await getApiCurrencies();
			setState({ status: 'ready', currencies });
		} catch {
			// handled by the state transition — the UI offers the retry (§10)
			setState({ status: 'currencies-failed' });
		}
	}, []);

	useEffect(() => {
		/**
		 * @name start
		 *
		 * @description Runs the boot sequence: init (texts + language) first, currencies second.
		 *
		 * @returns {Promise<void>} resolves when the boot reaches a terminal state
		 */
		const start = async (): Promise<void> => {
			try {
				if (!i18nStarted.current) {
					i18nStarted.current = true;
					const init = await getApiInit();
					const language = resolveLanguage(
						localStorage.getItem(LANGUAGE_STORAGE_KEY),
						navigator.languages,
						init.languages,
					);
					await initI18n(init.translations, language);
				}
			} catch {
				// terminal — the only state rendered without translations (§3 fallback)
				setState({ status: 'init-failed' });
				return;
			}
			await loadCurrencies();
		};
		void start();
	}, [loadCurrencies]);

	const retryCurrencies = useCallback((): void => {
		setState({ status: 'loading' });
		void loadCurrencies();
	}, [loadCurrencies]);

	return <BootContext.Provider value={{ state, retryCurrencies }}>{children}</BootContext.Provider>;
};
