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

// The §9 rate limit on POST /api/convert — per IP, per Lambda instance (the README documents
// the per-instance multiplication; the account concurrency cap of 10 is the hard backstop)
export const RATE_LIMIT_MAX = 60;

export const RATE_LIMIT_WINDOW = '1 minute';

// trustProxy hop count — trust exactly ONE hop: the socket address (the CloudFront egress)
// counts as hop 0 and is the single trusted proxy, so request.ip resolves to the RIGHTMOST
// x-forwarded-for entry (the viewer IP CloudFront itself appended). A higher count would walk
// further left into the client-forged prefix; `true` would walk all the way to the leftmost.
export const TRUST_PROXY_HOPS = 1;
