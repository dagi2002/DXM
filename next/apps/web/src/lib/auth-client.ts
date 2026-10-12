import { magicLinkClient, organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
  basePath: '/api/auth',
  plugins: [organizationClient(), magicLinkClient()],
});

/** Maps Better Auth error codes to our message keys. */
export function authErrorKey(code: string | undefined): string {
  switch (code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'auth.error.invalidCredentials';
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'auth.error.emailTaken';
    case 'PASSWORD_TOO_SHORT':
      return 'auth.error.weakPassword';
    case 'INVALID_PASSWORD':
      return 'auth.error.wrongPassword';
    case 'INVALID_CODE':
      return 'auth.twoFactor.error.invalidCode';
    case 'INVALID_BACKUP_CODE':
      return 'auth.twoFactor.error.invalidBackupCode';
    case 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE':
    case 'INVALID_TWO_FACTOR_COOKIE':
      return 'auth.twoFactor.error.expired';
    case 'ACCOUNT_TEMPORARILY_LOCKED':
      return 'auth.twoFactor.error.locked';
    default:
      return 'auth.error.generic';
  }
}
