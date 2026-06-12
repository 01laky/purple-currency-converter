export type Language = 'en' | 'cs' | 'sk';

// The catalog is fixed at depth ≤ 3 from the language root (§3: errors → validation → leaf);
// the bounded type (instead of a recursive one) keeps the OpenAPI schema reference-free —
// the recursive z.lazy emitted a dangling $ref no real generator accepts (found at v0.9.0 by orval)
export type TranslationGroup = Record<string, string | Record<string, string>>;

export type TranslationTree = Record<string, string | TranslationGroup>;
