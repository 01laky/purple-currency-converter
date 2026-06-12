// client-side budget — above the API's own 10 s Lambda timeout would be pointless waiting
export const REQUEST_TIMEOUT_MS = 12_000;

export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';

// the catalog key shown for transport-level failures — translated like every other text
// (errors.network since 0.10.0: errors.internal blamed the server for the client's network)
export const NETWORK_ERROR_KEY = 'errors.network';
