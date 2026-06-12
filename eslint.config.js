import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{ ignores: ['**/node_modules/**', 'coverage/**', '**/.sst/**'] },
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
	{
		files: ['deploy/sst.config.ts'],
		rules: {
			// SST v4 REQUIRES the triple-slash reference to its generated config.d.ts —
			// without it the $config/$app/sst globals have no types
			'@typescript-eslint/triple-slash-reference': 'off',
		},
	},
);
