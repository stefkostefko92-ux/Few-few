import type { MemberRole } from '../auth/roles.js';

/** Общото на членовете: грешката и кой действа (без цикъл между members.ts и member-roles.ts). */
export class MemberError extends Error {
  constructor(
    readonly code:
      | 'notFound'
      | 'forbiddenRole'
      | 'alreadyMember'
      | 'rateLimited'
      | 'invalid'
      | 'wrongEmail'
      | 'loginRequired'
      | 'invalidName'
      | 'self'
      | `password.${string}`,
  ) {
    super(code);
  }
}

export type Actor = { userId: string; role: MemberRole };
