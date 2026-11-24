const configuredApiUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "");
const API = configuredApiUrl
  ? configuredApiUrl.endsWith("/api/v1")
    ? configuredApiUrl
    : `${configuredApiUrl.replace(/\/api$/, "")}/api/v1`
  : import.meta.env.PROD
    ? "/api/v1"
    : "http://localhost:4000/api/v1";

export const SERVER_ORIGIN = API.replace(/\/api\/v1\/?$/, "");

// The JWT is held in an HttpOnly cookie, never in localStorage.
// Local storage contains only a non-sensitive display cache for the app shell.
export function hasCachedUser() {
  return Boolean(getUser());
}

// Compatibility alias for any older component still using the old helper name.
export const getToken = hasCachedUser;

export function setSession(_token, user) {
  if (user) localStorage.setItem("unfold_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("unfold_user");
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
    const error = new Error(data?.error?.message || "Request failed. Please try again.");
    error.code = code;
    error.status = response.status;
    error.details = data?.error?.details;
    throw error;
  }
  return data;
}
