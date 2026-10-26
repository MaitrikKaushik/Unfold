import React, { useState } from "react";
import { api, setSession } from "../services/api";
import UnfoldLogo from "./UnfoldLogo";

export default function AuthPanel({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      const body = mode === "register"
        ? { username: form.username.trim(), email: form.email.trim(), password: form.password }
        : { login: form.username.trim(), password: form.password };

      const data = await api(`/auth/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify(body)
      });

      setSession(data.token, data.user);
      onAuth(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleMode(newMode) {
    setMode(newMode);
    setError("");
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-header">
          <UnfoldLogo size="md" />
          <p className="eyebrow mt-3">UNFOLD COMMUNITY</p>
          <h1>{mode === "login" ? "Welcome back." : "Join Unfold."}</h1>
          <p className="muted">
            {mode === "login"
              ? "Sign in to participate, vote, and unlock posting rights."
              : "Create an account to join discussions and share knowledge."}
          </p>
        </div>

        <form onSubmit={submit} className="mt-4">
          {mode === "register" && (
            <>
              <div className="mb-3">
                <label className="form-label" htmlFor="register-username">Username</label>
                <input
                  id="register-username"
                  className="form-control"
                  required
                  minLength={3}
                  maxLength={24}
                  placeholder="e.g. alex_dev"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
                <span className="form-text muted small">3–24 characters: letters, numbers, or underscores.</span>
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="register-email">Email address</label>
                <input
                  id="register-email"
                  type="email"
                  className="form-control"
                  required
                  placeholder="alex@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </>
          )}

          {mode === "login" && (
            <div className="mb-3">
              <label className="form-label" htmlFor="login-username">Username or email</label>
              <input
                id="login-username"
                className="form-control"
                required
                placeholder="Enter username or email"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
          )}

          <div className="mb-3">
            <label className="form-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              className="form-control"
              required
              minLength={mode === "register" ? 8 : undefined}
              placeholder={mode === "register" ? "Minimum 8 characters" : "Enter your password"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          {error && <div className="alert alert-danger py-2">{error}</div>}

          <button className="btn btn-dark w-100 py-2 mt-2" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Log in to Unfold" : "Create Unfold account"}
          </button>
        </form>

        <p className="text-center mt-3 mb-0 small muted">
          {mode === "login" ? "New to Unfold?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="link-button"
            onClick={() => toggleMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Create an account" : "Log in"}
          </button>
        </p>

        <div className="privacy-note">
          <span>◉</span> Pseudonymous by default. Quality content earns community trust.
        </div>
      </div>
    </div>
  );
}
