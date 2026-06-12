import { buildApp } from './app.js';
import { DEFAULT_PORT } from './lib/constants.js';
import { EnvVar } from './lib/enums.js';

/**
 * @name start
 *
 * @description The local adapter (proposal §2): builds the app, wires the graceful shutdown
 * (SIGINT/SIGTERM → app.close()) and listens on PORT (default 3000). Contains no logic — the
 * app is host-agnostic.
 *
 * @returns {Promise<void>} resolves once the server is listening
 */
const start = async (): Promise<void> => {
	const app = await buildApp();

	/**
	 * @name shutdown
	 *
	 * @description Closes the app on a termination signal and exits the process.
	 *
	 * @param {NodeJS.Signals} signal the received signal
	 *
	 * @returns {void} nothing — the process exits asynchronously
	 */
	const shutdown = (signal: NodeJS.Signals): void => {
		app.log.info({ signal }, 'shutting down');
		void app.close().then(() => process.exit(0));
	};
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);

	const portValue = process.env[EnvVar.PORT];
	const port = portValue === undefined || portValue === '' ? DEFAULT_PORT : Number(portValue);
	await app.listen({ port, host: '0.0.0.0' });
};

await start();
