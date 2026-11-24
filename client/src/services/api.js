function normalizeApiUrl(rawUrl) {
  if (!rawUrl) {
    return import.meta.env.PROD ? "/api/v1" : "http://localhost:4000/api/v1";
  }
  const clean = rawUrl.trim().replace(/\/+$/, "");
  if (clean.endsWith("/api/v1")) return clean;
  if (clean.endsWith("/api")) return `${clean.slice(0, -4)}/api/v1`;
  return `${clean}/api/v1`;
}

const configuredApiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;
const API = normalizeApiUrl(configuredApiUrl);

export const SERVER_ORIGIN = API.startsWith("http")
  ? API.replace(/\/api\/v1\/?$/, "")
  : "";

export function getToken() {
  try {
    return localStorage.getItem("unfold_token") || null;
  } catch {
    return null;
  }
}

export function hasCachedUser() {
  return Boolean(getUser());
}

export function setSession(token, user) {
  if (token) {
    try {
      localStorage.setItem("unfold_token", token);
    } catch {}
  }
  if (user) {
    try {
      localStorage.setItem("unfold_user", JSON.stringify(user));
    } catch {}
  }
}

export function clearSession() {
  try {
    localStorage.removeItem("unfold_token");
    localStorage.removeItem("unfold_user");
  } catch {}
}

export function getUser() {
  try {
    const raw = localStorage.getItem("unfold_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getAssetUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (!SERVER_ORIGIN) return path;
  return `${SERVER_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

export async function api(path, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  let body = options.body;

  const token = getToken();
  if (token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (body && !isForm && typeof body !== "string") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  } else if (body && !isForm && typeof body === "string") {
    headers["Content-Type"] = "application/json";
  }

  let response;
  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      body,
      headers,
      credentials: "include"
    });
  } catch (networkError) {
    const error = new Error("Could not reach the Unfold server. Check that the backend is running.");
    error.cause = networkError;
    throw error;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data?.error?.code;
    if (response.status === 401 && getUser()) {
      clearSession();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("unfold_auth_expired", {
          detail: data?.error?.message || "Your session has expired. Please log in again."
        }));
      }
    }
    const message = data?.error?.message
      || data?.message
      || (response.status === 405
        ? "API routing error (405 Method Not Allowed). The request hit the frontend instead of the API server."
        : "Request failed. Please try again.");
    const error = new Error(message);
    error.code = code;
    error.status = response.status;
    error.details = data?.error?.details;
    throw error;
  }
  return data;
}
