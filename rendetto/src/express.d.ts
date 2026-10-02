import type { Principal } from './types.js';

declare global {
  namespace Express {
    interface Request {
      principal?: Principal;
    }
  }
}

export {};
