// Thin client for the NestJS API. Cookies carry the session, so we send
// credentials with every request.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// A single in-flight refresh shared by every 401'd request, so a burst of
// parallel calls triggers only one /auth/refresh.
let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        // Allow the next 401 (after this token also expires) to refresh again.
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

async function request<T>(path: string, method: string, body?: unknown, retry = true): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  // Access token expired: silently refresh once, then replay the request.
  if (res.status === 401 && retry && path !== "/auth/refresh" && path !== "/auth/login") {
    if (await tryRefresh()) return request<T>(path, method, body, false);
  }
  return handle<T>(res);
}

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data && (data.message || data.error)) || "Request failed";
    throw new Error(Array.isArray(message) ? message.join(", ") : message);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, "GET"),
  post: <T>(path: string, body?: unknown) => request<T>(path, "POST", body),
  patch: <T>(path: string, body?: unknown) => request<T>(path, "PATCH", body),
  put: <T>(path: string, body?: unknown) => request<T>(path, "PUT", body),
  del: <T>(path: string) => request<T>(path, "DELETE"),
  // Multipart upload (do NOT set Content-Type - the browser adds the boundary).
  upload: async <T>(path: string, formData: FormData) => {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });
    return handle<T>(res);
  },
};
