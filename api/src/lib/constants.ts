export const DEFAULT_PORT = 3000;

export const LOCAL_DYNAMO_ENDPOINT = 'http://localhost:8002';

export const LOCAL_DYNAMO_REGION = 'local';

export const LOCAL_DYNAMO_CREDENTIALS: { accessKeyId: string; secretAccessKey: string } = {
	accessKeyId: 'local',
	secretAccessKey: 'local',
};

export const DEFAULT_STATS_TABLE = 'ConversionStats';

// CORS exists for the local web dev only (§10) — production is same-origin through the Router
export const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:5173';

// /api/currencies HTTP cache (§3) — the browser/CDN side; the server side is the provider cache
export const CURRENCIES_CACHE_CONTROL = 'public, max-age=3600';

// /api/stats and /health (§3, revised at 0.10.0): behind the Router a MISSING Cache-Control
// is a vacuum CloudFront may fill with its default TTL — the explicit no-store defends
// regardless of the cache policy; cached statistics/diagnostics lie
export const NO_STORE_CACHE_CONTROL = 'no-store';

// §3: above ~2^53 JS numbers and cent arithmetic lose precision
export const MAX_AMOUNT = 1e12;
