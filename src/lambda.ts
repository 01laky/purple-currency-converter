import awsLambdaFastify from '@fastify/aws-lambda';
import { buildApp } from './app.js';

/**
 * @name handler
 *
 * @description The AWS adapter (proposal §2) — the Lambda twin of server.ts: the pure Fastify
 * app wrapped by @fastify/aws-lambda, exported as the Function URL handler (payload format
 * 2.0). Contains no logic — the app is host-agnostic and reads its configuration exclusively
 * from env variables.
 */
export const handler = awsLambdaFastify(await buildApp());
