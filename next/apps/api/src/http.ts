import type { ErrorCode, Role } from '@pulse/contracts';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Logger } from 'pino';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  locale: string;
  calendar: string;
}

export type AppEnv = {
  Variables: {
    requestId: string;
    clientIp: string;
    log: Logger;
    user?: SessionUser;
    sessionId?: string;
    activeOrgId?: string | null;
    orgId?: string;
    role?: Role;
  };
};

/** Throwable API error rendered as the standard envelope (ADR-005). */
export class ApiError extends HTTPException {
  constructor(
    status: ContentfulStatusCode,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(status, { message });
  }
}

export const notFound = (what = 'Resource') => new ApiError(404, 'not_found', `${what} not found`);
export const forbidden = () => new ApiError(403, 'forbidden', 'You do not have permission to do that');

export function errorBody(c: Context<AppEnv>, code: ErrorCode, message: string, details?: unknown) {
  return {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
      requestId: c.get('requestId'),
    },
  };
}
