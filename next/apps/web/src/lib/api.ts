import type { ErrorCode } from '@pulse/contracts/constants';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'network',
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Listener = () => void;
const unauthenticatedListeners = new Set<Listener>();
/** Called when any request returns 401 so the app can drop cached session state. */
export const onUnauthenticated = (fn: Listener) => {
  unauthenticatedListeners.add(fn);
  return () => unauthenticatedListeners.delete(fn);
};

export async function api<T>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    /** Expected 401s (session probe) shouldn't trigger the sign-out flow. */ quietUnauthenticated?: boolean;
  } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      credentials: 'include',
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'network', 'Network unavailable');
  }
  if (res.status === 204) return undefined as T;
  const payload = (await res.json().catch(() => null)) as {
    error?: { code: ErrorCode; message: string; details?: unknown; requestId?: string };
  } | null;
  if (!res.ok) {
    if (res.status === 401 && !init.quietUnauthenticated) unauthenticatedListeners.forEach((fn) => fn());
    const e = payload?.error;
    throw new ApiError(
      res.status,
      e?.code ?? 'internal',
      e?.message ?? res.statusText,
      e?.details,
      e?.requestId,
    );
  }
  return payload as T;
}

/** First field-level validation message for a path, from a validation_failed envelope. */
export function fieldError(err: unknown, path: string): string | undefined {
  if (!(err instanceof ApiError) || err.code !== 'validation_failed' || !Array.isArray(err.details))
    return undefined;
  const hit = (err.details as { path?: string; message?: string; field?: string }[]).find(
    (d) => d.path === path || d.field === path,
  );
  return hit?.message;
}
