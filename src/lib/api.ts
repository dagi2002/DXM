const DEFAULT_API_BASE = 'http://localhost:4000';

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
  const response = await fetch(getApiUrl(path), init);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
};
