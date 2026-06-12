/**
 * @name RateLimitExceededError
 *
 * @description Thrown by the @fastify/rate-limit errorResponseBuilder when a client exceeds
 * the §9 limit on POST /api/convert — the plugin THROWS the builder's return value, so it must
 * be an Error the central handler can recognize and map onto the unified 429 body.
 */
export class RateLimitExceededError extends Error {
	/**
	 * @name constructor
	 *
	 * @description Creates the error with a fixed internal message (never sent to the client —
	 * the response text comes from the i18n catalog).
	 */
	constructor() {
		super('rate limit exceeded');
		this.name = 'RateLimitExceededError';
	}
}
