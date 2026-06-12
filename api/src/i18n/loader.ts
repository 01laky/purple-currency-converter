import cs from './cs.json' with { type: 'json' };
import en from './en.json' with { type: 'json' };
import sk from './sk.json' with { type: 'json' };
import type { ErrorParams } from '../lib/types.js';
import type { Language, TranslationTree } from './types.js';

// Static imports only — the Lambda bundle has no files on disk (proposal §8)
export const TRANSLATIONS: Readonly<Record<Language, TranslationTree>> = { en, cs, sk };

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * @name resolveKey
 *
 * @description Walks a translation tree along a dot-separated key path and returns the leaf
 * text. A missing translation never falls back to the key, another language, an empty string
 * or a placeholder — it fails immediately (proposal §3, rule 24).
 *
 * @param {TranslationTree} tree the translation tree to search
 * @param {string} key the dot-separated key path (e.g. errors.validation.sameCurrency)
 *
 * @returns {string} the leaf text of the key
 *
 * @throws {Error} when the key does not exist or does not point at a leaf text
 */
const resolveKey = (tree: TranslationTree, key: string): string => {
	let node: string | TranslationTree = tree;
	for (const segment of key.split('.')) {
		if (typeof node === 'string' || node[segment] === undefined) {
			throw new Error(`Missing translation for key "${key}"`);
		}
		node = node[segment];
	}
	if (typeof node !== 'string') {
		throw new Error(`Translation key "${key}" does not point at a text`);
	}
	return node;
};

/**
 * @name formatEnglishMessage
 *
 * @description Builds the English `message` of the error model (proposal §3): looks the key up
 * in the EN tree and interpolates the {{param}} placeholders. A missing key or a missing
 * interpolation param fails immediately — no fallback of any kind (proposal §3, rule 24).
 *
 * @param {string} key the i18n key (e.g. errors.unsupportedCurrency)
 * @param {ErrorParams} params values for the {{param}} placeholders
 *
 * @returns {string} the interpolated English text
 *
 * @throws {Error} when the key is unknown or a referenced param is missing
 */
export const formatEnglishMessage = (key: string, params?: ErrorParams): string => {
	const text = resolveKey(TRANSLATIONS.en, key);
	return text.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
		const value = params?.[name];
		if (value === undefined) {
			throw new Error(`Missing interpolation param "${name}" for key "${key}"`);
		}
		return String(value);
	});
};
