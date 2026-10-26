const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export function getToken() { return localStorage.getItem("cg_token"); }
export function setSession(token, user) {
  localStorage.setItem("cg_token", token);
  localStorage.setItem("cg_user", JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem("cg_token");
  localStorage.removeItem("cg_user");
}
export function getUser() {
  try { return JSON.parse(localStorage.getItem("cg_user") || "null"); } catch { return null; }
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Request failed");
  return data;
}
