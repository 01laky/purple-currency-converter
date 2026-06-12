import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const DB_INIT_ATTEMPTS = 10;
const DB_INIT_RETRY_DELAY_MS = 1000;

/**
 * @name ensureEnvFile
 *
 * @description Copies .env.example to .env when .env does not exist yet (one-command
 * onboarding — proposal §7). An existing .env is never overwritten.
 *
 * @returns {void} nothing
 */
const ensureEnvFile = (): void => {
	if (existsSync('.env')) {
		process.stdout.write('.env already exists — keeping it\n');
		return;
	}
	copyFileSync('.env.example', '.env');
	process.stdout.write('.env created from .env.example\n');
};

/**
 * @name startDynamo
 *
 * @description Starts dynamodb-local in the background via docker compose.
 *
 * @returns {void} nothing
 *
 * @throws {Error} when docker compose fails (e.g. Docker is not running)
 */
const startDynamo = (): void => {
	execSync('docker compose -f ../docker-compose.yml up -d', { stdio: 'inherit' });
};

/**
 * @name initTableWithRetry
 *
 * @description Runs db:init until it succeeds — the dynamodb-local container needs a moment
 * after `docker compose up` before it accepts connections. Each failed attempt is reported;
 * after the last one the error propagates (rule 24).
 *
 * @returns {Promise<void>} resolves once the table exists
 *
 * @throws {Error} when db:init keeps failing after all the attempts
 */
const initTableWithRetry = async (): Promise<void> => {
	for (let attempt = 1; attempt <= DB_INIT_ATTEMPTS; attempt += 1) {
		try {
			execSync('npm run db:init', { stdio: 'inherit' });
			return;
		} catch (error) {
			if (attempt === DB_INIT_ATTEMPTS) {
				throw error;
			}
			process.stderr.write(
				`db:init attempt ${String(attempt)}/${String(DB_INIT_ATTEMPTS)} failed — dynamodb-local may still be starting, retrying\n`,
			);
			await delay(DB_INIT_RETRY_DELAY_MS);
		}
	}
};

ensureEnvFile();
startDynamo();
await initTableWithRetry();
process.stdout.write('Setup complete — run `npm run dev` to start the API on :3000\n');
