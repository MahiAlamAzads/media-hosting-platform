const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const WORKSPACE_URL =
  process.env.NEXT_PUBLIC_WORKSPACE_URL ?? "http://localhost:3000";
const ACCESS_KEY = "media_admin_access_token";

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
    credentials: "include",
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
  retry = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getAccessToken();
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (token) headers.set("authorization", `Bearer ${token}`);

  let response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && retry && !path.includes("/auth/")) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers.set("authorization", `Bearer ${refreshed}`);
      response = await fetch(`${API_URL}${path}`, {
        ...init,
        headers,
        credentials: "include",
      });
    }
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = new Error(
      payload?.error?.message ?? `Request failed (${response.status}).`,
    );
    Object.assign(error, {
      status: response.status,
      code: payload?.error?.code,
    });
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/api/v1/auth/logout`, {
    method: "POST",
    credentials: "include",
  }).catch(() => undefined);
  clearAccessToken();
}

export { API_URL, WORKSPACE_URL };
