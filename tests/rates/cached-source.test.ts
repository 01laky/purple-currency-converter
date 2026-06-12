import { describe, expect, it, vi } from 'vitest';
import { createCachedSource } from '../../src/rates/cached-source.js';

const TTL_MS = 600_000;

/**
 * @name createHarness
 *
 * @description Test harness — a cached source over a controllable fake clock and a counting
 * fetch (rule 1: nothing external, fake time per proposal §4).
 *
 * @param {() => Promise<string>} fetchImpl the fetch behavior of the test case
 *
 * @returns {{ source: ReturnType<typeof createCachedSource<string>>, fetchFn: ReturnType<typeof vi.fn>, tick: (ms: number) => void }} the harness
 */
const createHarness = (fetchImpl: () => Promise<string>) => {
	let time = 0;
	const fetchFn = vi.fn(fetchImpl);
	const source = createCachedSource<string>({ fetchFn, ttlMs: TTL_MS, now: () => time });
	return {
		source,
		fetchFn,
		tick: (ms: number): void => {
			time += ms;
		},
	};
};

describe('createCachedSource', () => {
	it('fetches on the first get and serves the value', async () => {
		const { source, fetchFn } = createHarness(async () => 'fresh');

		const result = await source.get();

		expect(result).toEqual({ value: 'fresh', fetchedAt: 0, stale: false });
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('serves from memory within the TTL — no refetch', async () => {
		const { source, fetchFn, tick } = createHarness(async () => 'fresh');

		await source.get();
		tick(TTL_MS - 1);
		const result = await source.get();

		expect(result.value).toBe('fresh');
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('refetches after the TTL expires', async () => {
		let counter = 0;
		const { source, fetchFn, tick } = createHarness(async () => `value-${String(counter++)}`);

		await source.get();
		tick(TTL_MS);
		const result = await source.get();

		expect(result).toEqual({ value: 'value-1', fetchedAt: TTL_MS, stale: false });
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it('concurrent callers share one in-flight fetch', async () => {
		let release: ((value: string) => void) | undefined;
		const { source, fetchFn } = createHarness(
			() =>
				new Promise<string>((resolve) => {
					release = resolve;
				}),
		);

		const [first, second] = [source.get(), source.get()];
		release?.('shared');

		expect((await first).value).toBe('shared');
		expect((await second).value).toBe('shared');
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('serves the stale copy with the ORIGINAL fetchedAt when the refresh fails', async () => {
		let shouldFail = false;
		const { source, fetchFn, tick } = createHarness(async () => {
			if (shouldFail) {
				throw new Error('upstream down');
			}
			return 'last-good';
		});

		await source.get();
		shouldFail = true;
		tick(TTL_MS + 1);
		const result = await source.get();

		expect(result).toEqual({ value: 'last-good', fetchedAt: 0, stale: true });
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it('propagates the error when the first fetch fails — nothing to fall back to', async () => {
		const { source } = createHarness(async () => {
			throw new Error('upstream down');
		});

		await expect(source.get()).rejects.toThrowError('upstream down');
	});

	it('ageSeconds is null before the first fetch and counts whole seconds after it', async () => {
		const { source, tick } = createHarness(async () => 'fresh');

		expect(source.ageSeconds()).toBeNull();
		await source.get();
		expect(source.ageSeconds()).toBe(0);
		tick(5_500);
		expect(source.ageSeconds()).toBe(5);
	});
});
