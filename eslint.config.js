import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{ ignores: ['node_modules/**', 'coverage/**'] },
	js.configs.recommended,
	...tseslint.configs.recommended,
	prettier,
	{
		files: ['**/*.ts'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/consistent-type-definitions': ['error', 'type'],
			// 'never' bans `as`/angle-bracket casts; the `as const` const assertion stays allowed (rule 23)
			'@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
		},
	},
);
