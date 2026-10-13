import { authClient } from './auth-client';

/**
 * Better Auth two-factor endpoints via the shared client's $fetch. We don't register
 * `twoFactorClient()` on the shell's auth client: these calls are only needed on the sign-in
 * and settings chunks, and the plugin would add to every page's first load (03 §8 budget).
 */
type Result<T> = Promise<{ data: T | null; error: { code?: string; status: number } | null }>;

const post = <T>(path: string, body: Record<string, unknown>): Result<T> =>
  authClient.$fetch<T>(path, { method: 'POST', body }) as unknown as Result<T>;

export const twoFactor = {
  enable: (password: string) =>
    post<{ totpURI: string; backupCodes: string[] }>('/two-factor/enable', { password }),
  disable: (password: string) => post<{ status: boolean }>('/two-factor/disable', { password }),
  verifyTotp: (code: string, trustDevice = false) =>
    post<{ token: string }>('/two-factor/verify-totp', { code, trustDevice }),
  verifyBackupCode: (code: string, trustDevice = false) =>
    post<{ token: string }>('/two-factor/verify-backup-code', { code, trustDevice }),
  generateBackupCodes: (password: string) =>
    post<{ status: boolean; backupCodes: string[] }>('/two-factor/generate-backup-codes', { password }),
};
