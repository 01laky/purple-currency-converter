export type Language = 'en' | 'cs' | 'sk';

export type TranslationTree = {
	[key: string]: string | TranslationTree;
};
