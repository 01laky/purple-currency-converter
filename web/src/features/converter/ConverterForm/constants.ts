// positive, at most 2 decimals; a comma decimal is accepted and normalized before the POST
export const AMOUNT_PATTERN = /^\d+([.,]\d{1,2})?$/;

// the 0.10.0 defaults (§10 amended): 0/EUR/CZK unless the user chooses otherwise; the
// pristine 0 is NOT submittable (the validation requires a positive amount) and is fully
// selected on focus so the first keystroke replaces it
export const DEFAULT_AMOUNT = '0';
export const DEFAULT_FROM = 'EUR';
export const DEFAULT_TO = 'CZK';
