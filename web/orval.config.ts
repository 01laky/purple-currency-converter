import { defineConfig } from 'orval';

// The generator's contract (prompt v0.9.0): every generated call flows through the custom
// axios mutator; the output is committed and prettier-formatted so the CI drift guard never
// trips on formatting noise. (orval 8 dropped output.prettier — the same goal is the
// afterAllFilesWrite hook.)
export default defineConfig({
	api: {
		input: '../api/openapi.json',
		output: {
			target: 'src/api/generated/client.ts',
			schemas: 'src/api/generated/model',
			client: 'axios-functions',
			override: {
				mutator: {
					path: 'src/api/mutator.ts',
					name: 'apiInstance',
				},
			},
		},
		hooks: {
			afterAllFilesWrite: 'prettier --write',
		},
	},
});
