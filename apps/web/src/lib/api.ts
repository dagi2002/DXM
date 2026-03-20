const DEFAULT_API_BASE = 'http://localhost:4000';

export class ApiError extends Error {
  status: number;
  code?: string;
  payload?: unknown;

  constructor(message: string, status: number, code?: string, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export const getApiBaseUrl = () => {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  return configured && configured.trim().length > 0
    ? configured.replace(/\/$/, '')
    : DEFAULT_API_BASE;
};

export const getApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
};

export const fetchJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(getApiUrl(path), {
    credentials: 'include',  // send httpOnly JWT cookies on every request
    ...init,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as
      | { error?: string; code?: string }
      | null;
    throw new ApiError(
      payload?.error || `Request failed: ${response.status}`,
      response.status,
      payload?.code,
      payload,
    );
  }

  return response.json() as Promise<T>;
};
