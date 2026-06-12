import { FALLBACK_LANGUAGE } from './constants';

/**
 * @name resolveLanguage
 *
 * @description The §10 language pick: ① the stored choice when the server still offers it,
 * ② the first browser language whose primary subtag the server offers, ③ the EN fallback.
 * The server list is the only authority — the frontend hardcodes nothing about languages.
 *
 * @param {string | null} stored the localStorage value
 * @param {readonly string[]} navigatorLanguages the browser preference list
 * @param {readonly string[]} available the languages the server offers
 *
 * @returns {string} the language to initialize with
 */
export const resolveLanguage = (
	stored: string | null,
	navigatorLanguages: readonly string[],
	available: readonly string[],
): string => {
	if (stored !== null && available.includes(stored)) {
		return stored;
	}
	for (const candidate of navigatorLanguages) {
		const primary = candidate.toLowerCase().split('-')[0] ?? '';
		if (available.includes(primary)) {
			return primary;
		}
	}
	return FALLBACK_LANGUAGE;
};
