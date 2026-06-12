import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type DirectoryExists = (directory: string) => boolean;

/**
 * @name resolveSwaggerStaticDir
 *
 * @description Resolves the Swagger UI assets directory for the Lambda bundle (proposal §8):
 * an existing static/ directory NEXT TO THIS MODULE returns its absolute path (on Lambda the
 * SST copyFiles places it beside the bundle); otherwise undefined and the plugin falls back to
 * its node_modules default (the local run). "Next to the module" is import.meta.url +
 * fileURLToPath — the project is ESM, __dirname does not exist and process.cwd() would track
 * the working directory instead of this file. The existence check is injectable for tests.
 *
 * @param {DirectoryExists} directoryExists the existence check (defaults to fs.existsSync)
 *
 * @returns {string | undefined} the absolute assets path, or undefined for the local default
 */
export const resolveSwaggerStaticDir = (
	directoryExists: DirectoryExists = existsSync,
): string | undefined => {
	const staticDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'static');
	return directoryExists(staticDir) ? staticDir : undefined;
};
