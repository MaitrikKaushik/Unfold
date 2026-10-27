const configuredApiUrl = import.meta.env.VITE_API_URL?.replace(/\/+$/, "");
const API = configuredApiUrl
  ? configuredApiUrl.endsWith("/api")
    ? configuredApiUrl
    : `${configuredApiUrl}/api`
  : import.meta.env.PROD
  ? "/api"
  : "http://localhost:4000/api";
export const SERVER_ORIGIN = API.replace(/\/api\/?$/, "");

export function getToken() {
  return localStorage.getItem("unfold_token") || localStorage.getItem("cg_token");
}

export function setSession(token, user) {
  localStorage.setItem("unfold_token", token);
  localStorage.setItem("unfold_user", JSON.stringify(user));
  // Clean up legacy keys
  localStorage.removeItem("cg_token");
  localStorage.removeItem("cg_user");
}

export function clearSession() {
  localStorage.removeItem("unfold_token");
  localStorage.removeItem("unfold_user");
  localStorage.removeItem("cg_token");
  localStorage.removeItem("cg_user");
}

export function getUser() {
  try {
    const raw = localStorage.getItem("unfold_user") || localStorage.getItem("cg_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getAssetUrl(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (!SERVER_ORIGIN) return path;
  return `${SERVER_ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // If the server rejected an authenticated request with 401, auto-clear stale session
    if (response.status === 401 && token && (data?.error?.code === "INVALID_TOKEN" || data?.error?.code === "AUTH_REQUIRED")) {
      clearSession();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("unfold_auth_expired", { detail: data?.error?.message }));
      }
    }

    const message = data?.error?.message || "Request failed. Please try again.";
    const err = new Error(message);
    err.code = data?.error?.code;
    err.status = response.status;
    err.details = data?.error?.details;
    throw err;
  }
  return data;
}
