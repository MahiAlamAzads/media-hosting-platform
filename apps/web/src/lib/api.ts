const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const ACCESS_KEY = "media_access_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ACCESS_KEY);
}

export function setAccessToken(token: string): void {
  sessionStorage.setItem(ACCESS_KEY, token);
}

export function clearAccessToken(): void {
  if (typeof window !== "undefined") sessionStorage.removeItem(ACCESS_KEY);
}

async function refreshAccessToken(): Promise<string | null> {
  const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
    method: "POST",
    credentials: "include"
  });

  if (!response.ok) {
    clearAccessToken();
    return null;
  }

  const payload = await response.json();
  const token = payload.data.accessToken as string;
  setAccessToken(token);
  return token;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  retry = true
): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);

  if (!(init.body instanceof Blob) && !(init.body instanceof ArrayBuffer) && init.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (token) headers.set("authorization", `Bearer ${token}`);

  let response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers
  });

  if (response.status === 401 && retry && !path.includes("/auth/")) {
    const nextToken = await refreshAccessToken();
    if (nextToken) {
      headers.set("authorization", `Bearer ${nextToken}`);
      response = await fetch(`${API_URL}${path}`, {
        ...init,
        credentials: "include",
        headers
      });
    }
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = new Error(payload?.error?.message ?? `Request failed with ${response.status}.`);
    Object.assign(error, { status: response.status, code: payload?.error?.code });
    throw error;
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/api/v1/auth/logout`, {
    method: "POST",
    credentials: "include"
  }).catch(() => undefined);
  clearAccessToken();
}
