export const OER_LATEST_URL = 'https://openexchangerates.org/api/latest.json';

export const CURRENCY_NAMES_URL = 'https://openexchangerates.org/api/currencies.json';

export const RATES_TTL_MS = 600_000;

// Names effectively never change — aligned with the Cache-Control max-age=3600 of /api/currencies (§3)
export const NAMES_TTL_MS = 3_600_000;

export const FETCH_TIMEOUT_MS = 5_000;
