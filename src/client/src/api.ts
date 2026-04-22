export type ApiOptions = RequestInit & {
  csrfToken?: string;
};

export type SessionPayload = {
  authenticated: boolean;
  csrf_token?: string;
  user?: {
    id: string;
    email: string;
    display_name: string;
    created_at: string;
    last_login_at: string | null;
  } | null;
};

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (options.csrfToken) {
    headers.set("x-csrf-token", options.csrfToken);
  }
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  const data = (await response.json().catch(() => ({
    ok: false,
    error: "Invalid server response.",
  }))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}.`);
  }
  return data;
}

export async function getSession(): Promise<SessionPayload> {
  return api<SessionPayload>("/api/auth/session");
}

export function nextPath(fallback = "/game"): string {
  const url = new URL(window.location.href);
  const next = url.searchParams.get("next") || fallback;
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
