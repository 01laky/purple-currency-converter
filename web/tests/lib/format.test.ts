import { describe, expect, it } from 'vitest';
import { formatCount, formatMoney } from '../../src/lib/format';

describe('formatMoney — the fixed Figma literal, independent of every locale', () => {
	it('formats the design example exactly: 4942.52 → "4 942,52 CZK" (a U+0020 space)', () => {
		const formatted = formatMoney(4942.52, 'CZK');

		expect(formatted).toBe('4 942,52 CZK');
		// the separator is the REGULAR space — not the U+00A0/U+202F ICU would produce
		expect(formatted.charCodeAt(1)).toBe(0x20);
	});

	it('always pads to exactly 2 decimals', () => {
		expect(formatMoney(100, 'EUR')).toBe('100,00 EUR');
		expect(formatMoney(0.5, 'GBP')).toBe('0,50 GBP');
	});

	it('groups every three digits', () => {
		expect(formatMoney(1234567.8, 'EUR')).toBe('1 234 567,80 EUR');
		expect(formatMoney(999, 'EUR')).toBe('999,00 EUR');
	});

	it('handles the honest zero', () => {
		expect(formatMoney(0, 'JPY')).toBe('0,00 JPY');
	});
});

describe('formatCount', () => {
	it('groups thousands with the same fixed space, no decimals', () => {
		expect(formatCount(1234567)).toBe('1 234 567');
		expect(formatCount(42)).toBe('42');
	});
});
