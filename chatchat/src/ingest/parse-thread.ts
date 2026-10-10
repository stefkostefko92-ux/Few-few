import { parentPort, workerData } from 'node:worker_threads';
import { parseDocument, type ParseRequest } from './parse.js';

/**
 * Входът на отделната нишка за разбора (isolate.ts): един файл, един отговор, край. Паметта на
 * нишката е с таван (resourceLimits), срокът се пази отвън (terminate).
 */
const request = workerData as ParseRequest;
const outcome = await parseDocument({ ...request, bytes: new Uint8Array(request.bytes) });
parentPort?.postMessage(outcome);
