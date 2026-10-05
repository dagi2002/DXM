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
    default:
      return 'auth.error.generic';
  }
}
