import { describe, expect, it } from 'vitest';
import { resolveLanguage } from '../../src/i18n/resolveLanguage';

const SERVER_LANGUAGES = ['en', 'cs', 'sk'];

describe('resolveLanguage — the §10 chain', () => {
	it('prefers the stored choice when the server still offers it', () => {
		expect(resolveLanguage('sk', ['en-US'], SERVER_LANGUAGES)).toBe('sk');
	});

	it('ignores a stored language the server no longer offers', () => {
		expect(resolveLanguage('de', ['cs-CZ'], SERVER_LANGUAGES)).toBe('cs');
	});

	it('matches the browser language by its primary subtag', () => {
		expect(resolveLanguage(null, ['sk-SK', 'en-US'], SERVER_LANGUAGES)).toBe('sk');
	});

	it('walks the browser list until a supported language appears', () => {
		expect(resolveLanguage(null, ['de-DE', 'fr', 'cs-CZ'], SERVER_LANGUAGES)).toBe('cs');
	});

	it('falls back to EN when nothing matches', () => {
		expect(resolveLanguage(null, ['de-DE', 'fr'], SERVER_LANGUAGES)).toBe('en');
	});
});
