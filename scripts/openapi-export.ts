import { writeFileSync } from 'node:fs';
import { buildApp } from '../src/app.js';

/**
 * @name exportOpenApi
 *
 * @description Exports the OpenAPI specification generated from the Zod schemas into
 * openapi.json (proposal §3) — the committed contract guarded by the CI drift guard (§7) and
 * the future source of the frontend client (§10).
 *
 * @returns {Promise<void>} resolves once openapi.json is written
 */
const exportOpenApi = async (): Promise<void> => {
	const app = await buildApp();
	await app.ready();
	const document = app.swagger();
	writeFileSync('openapi.json', `${JSON.stringify(document, null, '\t')}\n`);
	await app.close();
	process.stdout.write('openapi.json exported\n');
};

await exportOpenApi();
