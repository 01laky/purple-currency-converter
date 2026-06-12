export const DEFAULT_PORT = 3000;

export const LOCAL_DYNAMO_ENDPOINT = 'http://localhost:8002';

export const LOCAL_DYNAMO_REGION = 'local';

export const LOCAL_DYNAMO_CREDENTIALS: { accessKeyId: string; secretAccessKey: string } = {
	accessKeyId: 'local',
	secretAccessKey: 'local',
};

export const DEFAULT_STATS_TABLE = 'ConversionStats';

// /api/currencies HTTP cache (§3) — the browser/CDN side; the server side is the provider cache
export const CURRENCIES_CACHE_CONTROL = 'public, max-age=3600';
