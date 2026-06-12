import { describe, expect, it } from 'vitest';
import { roundMoney } from '../../src/lib/money.js';

describe('roundMoney — half-up to 2 decimal places via the decimal string', () => {
	it('rounds 1.005 UP to 1.01 — the float trap the naive Math.round(x * 100) / 100 fails', () => {
		// the naive way: 1.005 * 100 === 100.49999999999999 → rounds DOWN to 1.00
		expect(roundMoney(1.005)).toBe(1.01);
	});

	it('rounds 0.005 up to 0.01 — the smallest half-up boundary', () => {
		expect(roundMoney(0.005)).toBe(0.01);
	});

	it('rounds 2.675 up to 2.68 — another classic float-representation trap', () => {
		expect(roundMoney(2.675)).toBe(2.68);
	});

	it('rounds down when the third decimal is below 5', () => {
		expect(roundMoney(1.004)).toBe(1);
		expect(roundMoney(86.123)).toBe(86.12);
	});

	it('carries across the integer boundary (0.999 → 1)', () => {
		expect(roundMoney(0.999)).toBe(1);
		expect(roundMoney(4.9999)).toBe(5);
	});

	it('passes exact 2-decimal values through unchanged', () => {
		expect(roundMoney(86.12)).toBe(86.12);
		expect(roundMoney(0.01)).toBe(0.01);
	});

	it('passes whole numbers through unchanged — toString() has no decimal point', () => {
		expect(roundMoney(100)).toBe(100);
		expect(roundMoney(0)).toBe(0);
		expect(roundMoney(1e12)).toBe(1e12);
	});

	it('handles long decimal expansions (0.1 + 0.2)', () => {
		expect(roundMoney(0.1 + 0.2)).toBe(0.3);
	});

	it('handles large values near the amount bound', () => {
		expect(roundMoney(999_999_999_999.995)).toBe(1_000_000_000_000);
		expect(roundMoney(999_999_999_999.99)).toBe(999_999_999_999.99);
	});

	it('rounds sub-1e-6 values to the honest 0 — toString() goes exponential there', () => {
		expect(roundMoney(1e-7)).toBe(0);
		expect(roundMoney(0.0000063)).toBe(0);
	});

	it('THROWS on non-finite, negative and oversized exponential inputs', () => {
		expect(() => roundMoney(Number.NaN)).toThrowError('finite');
		expect(() => roundMoney(Number.POSITIVE_INFINITY)).toThrowError('finite');
		expect(() => roundMoney(-1)).toThrowError('non-negative');
		expect(() => roundMoney(1e21)).toThrowError('exponential');
	});
});
