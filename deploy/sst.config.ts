/// <reference path="./.sst/platform/config.d.ts" />

// The SST v4 infrastructure (proposal §8). Run the SST commands FROM deploy/;
// `sst deploy`/`sst remove` are executed exclusively by the human (deny-listed).
export default $config({
	app(input) {
		return {
			name: 'purple-currency-converter',
			// production survives a config removal; dev stages clean up after themselves
			removal: input?.stage === 'production' ? 'retain' : 'remove',
			home: 'aws',
			providers: { aws: { region: 'eu-central-1' } },
		};
	},
	async run() {
		// Every stage gets its own table — dev conversions never pollute production (§8)
		const stats = new sst.aws.Dynamo('Stats', {
			fields: { pk: 'string', sk: 'string' },
			primaryIndex: { hashKey: 'pk', rangeKey: 'sk' },
		});

		// The OER key lives in SST secrets, never in the repo (§9): `npx sst secret set OerApiKey ...`
		const oerApiKey = new sst.Secret('OerApiKey');

		const api = new sst.aws.Function('Api', {
			// The API lives in api/ since the v0.9.0 move — the handler lives outside deploy/
			handler: '../api/src/lambda.handler',
			url: true,
			// link = IAM least privilege (§9): the function may touch exactly its one table
			link: [stats, oerApiKey],
			// The parameters are documented decisions, not defaults (§8):
			// nodejs22.x matches the pinned local Node (§7)
			runtime: 'nodejs22.x',
			// CPU scales with memory -> faster cold starts and responses
			memory: '512 MB',
			// above the 5 s OER fetch budget (§4) — a slow OER ends as a controlled
			// stale/502, never as Lambda killing the request
			timeout: '10 seconds',
			// The concurrency cap of 10 is enforced by the ACCOUNT-LEVEL quota (§9); no
			// per-function `reserved` — with a quota of 10 AWS leaves no room for reservations
			environment: {
				// The app reads configuration EXCLUSIVELY from env vars (§2) — it must not
				// know it is hosted; DYNAMO_ENDPOINT stays unset = the AWS mode of lib/dynamo.ts
				STATS_TABLE: stats.name,
				OER_API_KEY: oerApiKey.value,
				// drives the info log level (§9)
				NODE_ENV: 'production',
			},
			copyFiles: [
				// The Swagger UI assets do not exist in the bundle (§8). The `../` is
				// load-bearing: this path resolves relative to deploy/, whose node_modules
				// holds ONLY sst — the assets live in the ROOT node_modules.
				// (Shifted to ../api/node_modules/... at the v0.9.0 move, as planned.)
				{ from: '../api/node_modules/@fastify/swagger-ui/static', to: 'static' },
			],
		});

		// The same-origin production (§10 revised): ONE CloudFront domain — /api, /docs and
		// /health go to the Lambda Function URL (a prefix matches whole path segments; no
		// rewrite, the Lambda routes carry their prefixes), everything else is the StaticSite.
		// No CORS exists in production; VITE_API_URL stays EMPTY in the build — the web calls
		// relative paths through this router.
		const router = new sst.aws.Router('Edge');
		router.route('/api', api.url);
		router.route('/docs', api.url);
		router.route('/health', api.url);

		const web = new sst.aws.StaticSite('Web', {
			path: '../web',
			build: {
				command: 'npm run build',
				output: 'dist',
			},
			router: { instance: router },
		});

		return { url: router.url, api: api.url, web: web.url };
	},
});
