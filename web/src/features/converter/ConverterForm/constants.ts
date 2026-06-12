// positive, at most 2 decimals; a comma decimal is accepted and normalized before the POST
export const AMOUNT_PATTERN = /^\d+([.,]\d{1,2})?$/;

// the Figma example converts into CZK — the defaults mirror it
export const DEFAULT_FROM = 'EUR';
export const DEFAULT_TO = 'CZK';
