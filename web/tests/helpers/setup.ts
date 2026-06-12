import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// RTL auto-cleanup hooks into globals we deliberately do not enable — explicit is better
afterEach(() => {
	cleanup();
});
