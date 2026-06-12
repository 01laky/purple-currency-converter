import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveSwaggerStaticDir } from '../../src/lib/swagger.js';

describe('resolveSwaggerStaticDir', () => {
	it('returns the absolute static/ path when the directory exists next to the module (Lambda)', () => {
		const seen: string[] = [];
		const result = resolveSwaggerStaticDir((directory) => {
			seen.push(directory);
			return true;
		});

		expect(result).toBeDefined();
		expect(path.isAbsolute(result ?? '')).toBe(true);
		expect(result?.endsWith(`${path.sep}static`)).toBe(true);
		// the check ran against the module-relative path, not the working directory
		expect(seen[0]).toBe(result);
		expect(result?.includes(`${path.sep}lib${path.sep}`)).toBe(true);
	});

	it('returns undefined when the directory is missing (the local node_modules default)', () => {
		expect(resolveSwaggerStaticDir(() => false)).toBeUndefined();
	});
});
