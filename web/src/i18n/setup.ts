import i18next from 'i18next';
import type { Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * @name initI18n
 *
 * @description Initializes i18next EXCLUSIVELY from the /api/init payload (§3 — the backend is
 * the single source of all texts) under the no-fallback policy, with the exact pinned trio
 * (prompt v0.9.0): `fallbackLng: false` — the default `dev` fallback would silently serve the
 * ENGLISH text for a key missing in cs/sk, literally the forbidden fallback;
 * `parseMissingKeyHandler` THROWS — a missing key fails immediately, never resolving to the
 * key itself; `returnEmptyString: false` — an empty string counts as missing and reaches the
 * throwing handler. Also sets <html lang>.
 *
 * @param {Record<string, object>} translations the per-language trees from /api/init
 * @param {string} language the resolved language
 *
 * @returns {Promise<void>} resolves once i18next is ready
 */
export const initI18n = async (
	translations: Record<string, object>,
	language: string,
): Promise<void> => {
	const resources: Resource = Object.fromEntries(
		Object.entries(translations).map(([lng, tree]) => [lng, { translation: tree }]),
	);
	await i18next.use(initReactI18next).init({
		resources,
		lng: language,
		fallbackLng: false,
		returnEmptyString: false,
		parseMissingKeyHandler: (key: string): string => {
			throw new Error(`Missing translation for key "${key}"`);
		},
		interpolation: { escapeValue: false },
	});
	document.documentElement.lang = language;
};
