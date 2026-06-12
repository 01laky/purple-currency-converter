import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../../src/i18n/constants.js';
import { TRANSLATIONS, formatEnglishMessage } from '../../src/i18n/loader.js';
import type { TranslationTree } from '../../src/i18n/types.js';
import { ErrorKey } from '../../src/lib/enums.js';

/**
 * @name collectLeafKeys
 *
 * @description Collects all dot-separated leaf key paths of a translation tree, sorted — the
 * comparable fingerprint of a catalog (a missing AND an extra key both change it).
 *
 * @param {TranslationTree} tree the tree to walk
 * @param {string} prefix the key prefix of the current level
 *
 * @returns {string[]} the sorted leaf key paths
 */
const collectLeafKeys = (tree: TranslationTree, prefix = ''): string[] => {
	const keys: string[] = [];
	for (const [name, value] of Object.entries(tree)) {
		const path = prefix === '' ? name : `${prefix}.${name}`;
		if (typeof value === 'string') {
			keys.push(path);
		} else {
			keys.push(...collectLeafKeys(value, path));
		}
	}
	return keys.sort();
};

/**
 * @name collectPlaceholders
 *
 * @description Returns the sorted {{param}} placeholder names used by a leaf text.
 *
 * @param {string} text the translation text
 *
 * @returns {string[]} the sorted placeholder names
 */
const collectPlaceholders = (text: string): string[] =>
	[...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? '').sort();

/**
 * @name resolveLeaf
 *
 * @description Test helper — resolves a dot-separated key to its leaf text in a tree.
 *
 * @param {TranslationTree} tree the tree to search
 * @param {string} key the dot-separated key path
 *
 * @returns {string | undefined} the leaf text, or undefined when missing
 */
const resolveLeaf = (tree: TranslationTree, key: string): string | undefined => {
	let node: string | TranslationTree | undefined = tree;
	for (const segment of key.split('.')) {
		if (node === undefined || typeof node === 'string') {
			return undefined;
		}
		node = node[segment];
	}
	return typeof node === 'string' ? node : undefined;
};

describe('translation parity', () => {
	const enKeys = collectLeafKeys(TRANSLATIONS.en);

	it.each(LANGUAGES.filter((language) => language !== 'en'))(
		'%s has exactly the EN key catalog — no missing and no extra keys',
		(language) => {
			expect(collectLeafKeys(TRANSLATIONS[language])).toEqual(enKeys);
		},
	);

	it('every leaf of every language is a non-empty text', () => {
		for (const language of LANGUAGES) {
			for (const key of collectLeafKeys(TRANSLATIONS[language])) {
				expect(resolveLeaf(TRANSLATIONS[language], key), `${language}:${key}`).toBeTruthy();
			}
		}
	});

	it('every key uses the same {{param}} placeholders in every language', () => {
		for (const key of enKeys) {
			const enPlaceholders = collectPlaceholders(resolveLeaf(TRANSLATIONS.en, key) ?? '');
			for (const language of LANGUAGES) {
				expect(
					collectPlaceholders(resolveLeaf(TRANSLATIONS[language], key) ?? ''),
					`${language}:${key}`,
				).toEqual(enPlaceholders);
			}
		}
	});

	it('every ErrorKey used by the code exists in the catalog', () => {
		for (const key of Object.values(ErrorKey)) {
			expect(resolveLeaf(TRANSLATIONS.en, key), key).toBeTruthy();
		}
	});
});

describe('formatEnglishMessage', () => {
	it('returns the EN text of a known key', () => {
		expect(formatEnglishMessage('errors.notFound')).toBe('Resource not found');
	});

	it('interpolates {{param}} placeholders', () => {
		expect(formatEnglishMessage('errors.unsupportedCurrency', { code: 'XYZ' })).toBe(
			'Currency XYZ is not supported',
		);
	});

	it('THROWS on an unknown key — no fallback to the key, English, empty or placeholder', () => {
		expect(() => formatEnglishMessage('errors.definitelyNotAKey')).toThrowError(
			'Missing translation for key "errors.definitelyNotAKey"',
		);
	});

	it('THROWS on a group key that is not a leaf text', () => {
		expect(() => formatEnglishMessage('errors.validation')).toThrowError(
			'does not point at a text',
		);
	});

	it('THROWS when an interpolation param is missing', () => {
		expect(() => formatEnglishMessage('errors.unsupportedCurrency')).toThrowError(
			'Missing interpolation param "code"',
		);
	});
});
