import React, { useState } from "react";
import { api, setSession } from "../services/api";
import UnfoldLogo from "./UnfoldLogo";

export default function AuthPanel({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", displayName: "", password: "", confirmPassword: "", usernameDescription: "" });
  const [suggesting, setSuggesting] = useState(false);
  const [createdAccount, setCreatedAccount] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      if (mode === "register" && form.password !== form.confirmPassword) {
        throw new Error("Your passwords do not match.");
      }

      let username = form.username.trim();
      if (mode === "register" && !username) {
        const suggestion = await api("/auth/username/suggest", {
          method: "POST",
          body: JSON.stringify({ description: form.usernameDescription.trim() })
        });
        username = suggestion.data.username;
        setForm((current) => ({ ...current, username }));
      }

      const payload = mode === "register"
        ? { password: form.password, displayName: form.displayName.trim(), username }
        : { username: form.username.trim(), password: form.password };

      const result = await api(`/auth/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const user = result.user || result.data?.user;
      if (!user) throw new Error("The server did not return an account profile.");

      setSession(undefined, user);
      if (mode === "register") {
        setCreatedAccount(user);
      } else {
        onAuth(user);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyUsername() {
    try {
      await navigator.clipboard.writeText(createdAccount.username);
      setCopied(true);
    } catch {
      setCopied(false);
      setError("Clipboard access was unavailable. Please select and copy your username manually.");
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setCreatedAccount(null);
    setError("");
    setForm({ username: "", displayName: "", password: "", confirmPassword: "", usernameDescription: "" });
  }

  if (createdAccount) {
    return (
      <div className="auth-wrap">
        <div className="auth-card registration-success-card">
          <div className="auth-header">
            <UnfoldLogo size="md" />
            <p className="eyebrow mt-3">YOUR UNFOLD IDENTITY</p>
            <h1>You're in.</h1>
            <p className="muted">Your account is ready. Save your username because this is what you'll use every time you log in.</p>
          </div>
          <div className="generated-username-panel">
            <span className="generated-username-label">YOUR GENERATED USERNAME</span>
            <strong>@{createdAccount.username}</strong>
            <button type="button" className="btn btn-outline-primary btn-sm" onClick={copyUsername}>
              {copied ? "Copied" : "Copy username"}
            </button>
          </div>
          <div className="alert alert-warning small mt-3 mb-3">
            Keep this username somewhere safe. Unfold uses your username and password for login; there is no email-based recovery in this prototype.
          </div>
          <button type="button" className="btn btn-primary w-100 py-2" onClick={() => onAuth(createdAccount)}>
            Continue to Unfold
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-header">
          <UnfoldLogo size="md" />
          <p className="eyebrow mt-3">A LITTLE CORNER OF THE INTERNET</p>
          <h1>{mode === "login" ? "Welcome back." : "Find your people."}</h1>
          <p className="muted">
            {mode === "login"
              ? "Sign in with your Unfold username and password."
              : "Create your account. We'll generate a unique username for you."}
          </p>
        </div>

        <form onSubmit={submit} className="mt-4">
          {mode === "register" ? (
            <>
              <div className="mb-3">
                <label className="form-label" htmlFor="register-display-name">Display name <span className="muted">(optional)</span></label>
                <input
                  id="register-display-name"
                  className="form-control"
                  maxLength={40}
                  placeholder="What should people call you?"
                  value={form.displayName}
                  onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                />
              </div>
              <div className="mb-3">
                <label className="form-label" htmlFor="username-inspiration">
                  Describe your username vibe <span className="muted">(optional)</span>
                </label>
                <textarea
                  id="username-inspiration"
                  className="form-control"
                  rows="2"
                  maxLength={300}
                  placeholder="e.g. astronomy, coding, minimal futuristic aesthetics..."
                  value={form.usernameDescription}
                  onChange={(event) => setForm({ ...form, usernameDescription: event.target.value })}
                />
                <div className="d-flex justify-content-between align-items-center mt-2 gap-2">
                  <small className="muted">Gemini will create a distinctive username. Leave blank for a surprise.</small>
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm flex-shrink-0"
                    disabled={suggesting || busy}
                    onClick={async () => {
                      setError("");
                      setSuggesting(true);
                      try {
                        const result = await api("/auth/username/suggest", {
                          method: "POST",
                          body: JSON.stringify({ description: form.usernameDescription.trim() })
                        });
                        setForm((current) => ({ ...current, username: result.data.username }));
                      } catch (suggestionError) {
                        setError(suggestionError.message);
                      } finally {
                        setSuggesting(false);
                      }
                    }}
                  >
                    {suggesting ? "Creating…" : form.username ? "Regenerate" : "Generate username"}
                  </button>
                </div>
              </div>
              {form.username && (
                <div className="generated-username-panel mb-3">
                  <span className="generated-username-label">YOUR USERNAME</span>
                  <strong>@{form.username}</strong>
                  <button type="button" className="btn btn-link btn-sm" onClick={() => setForm({ ...form, username: "" })}>Clear</button>
                </div>
              )}
            </>
          ) : (
            <div className="mb-3">
              <label className="form-label" htmlFor="login-username">Username</label>
              <input
                id="login-username"
                className="form-control"
                autoComplete="username"
                required
                placeholder="Enter username or email address"
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
              />
            </div>
          )}

          <div className="mb-3">
            <label className="form-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              className="form-control"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              required
              minLength={mode === "register" ? 8 : undefined}
              maxLength={128}
              placeholder={mode === "register" ? "At least 8 characters" : "Enter your password"}
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </div>

          {mode === "register" && (
            <div className="mb-3">
              <label className="form-label" htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                className="form-control"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                placeholder="Enter your password again"
                value={form.confirmPassword}
                onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
              />
            </div>
          )}

          {error && <div className="alert alert-danger py-2">{error}</div>}

          <button className="btn btn-primary w-100 py-2 mt-2" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Log in to Unfold" : "Create my account"}
          </button>
        </form>

        <p className="text-center mt-3 mb-0 small muted">
          {mode === "login" ? "New around here?" : "Already have an account?"}{" "}
          <button type="button" className="link-button" onClick={() => switchMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "Create an account" : "Log in"}
          </button>
        </p>

      </div>
    </div>
  );
}
