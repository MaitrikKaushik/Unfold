import React, { useState } from "react";
import { api, setSession } from "../services/api";

export default function SettingsView({ user, onUserUpdate, onLogout, onBackToFeed }) {
  const [username, setUsername] = useState(user.username || "");
  const [bio, setBio] = useState(user.bio || "");
  const [theme, setTheme] = useState(
    () => localStorage.getItem("unfold_theme") || "light"
  );
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await api("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({
          username: username.trim(),
          bio: bio.trim()
        })
      });

      if (res.token && res.user) {
        setSession(res.token, res.user);
      }
      onUserUpdate(res.user);
      setSuccess("Profile updated successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleThemeChange(newTheme) {
    setTheme(newTheme);
    localStorage.setItem("unfold_theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  }

  const memberDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString([], {
        year: "numeric",
        month: "long",
        day: "numeric"
      })
    : "Recently";

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button
          type="button"
          className="btn-back-feed"
          onClick={onBackToFeed}
          title="Return to feed"
        >
          ← Back to Community Feed
        </button>
        <h1>Settings & Profile</h1>
        <p className="muted">
          Manage your account information, public profile, and visual appearance.
        </p>
      </div>

      {success && (
        <div className="alert alert-success py-2 mb-3">
          {success}
          <button type="button" className="alert-close" onClick={() => setSuccess("")}>
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="alert alert-danger py-2 mb-3">
          {error}
          <button type="button" className="alert-close" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}

      {/* Section A & B: Account Information & Edit Profile */}
      <section className="settings-card mb-4">
        <div className="settings-card-header">
          <div className="settings-icon">👤</div>
          <div>
            <h3>Account & Profile</h3>
            <p className="muted small">Your pseudonymous community identity.</p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="mt-3">
          {/* Registered Email (Read-only) */}
          <div className="mb-3">
            <label className="form-label" htmlFor="settings-email">
              Registered Email
            </label>
            <div className="input-group">
              <input
                id="settings-email"
                type="email"
                className="form-control"
                value={user.email || "Registered with account"}
                readOnly
                disabled
              />
              <span className="input-group-text text-muted bg-subtle small">
                Verified
              </span>
            </div>
            <span className="form-text muted small">
              Email is private and cannot be changed.
            </span>
          </div>

          {/* Username */}
          <div className="mb-3">
            <label className="form-label" htmlFor="settings-username">
              Username
            </label>
            <input
              id="settings-username"
              type="text"
              className="form-control"
              required
              minLength={3}
              maxLength={24}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <span className="form-text muted small">
              3–24 characters: letters, numbers, or underscores.
            </span>
          </div>

          {/* Bio */}
          <div className="mb-3">
            <label className="form-label" htmlFor="settings-bio">
              Bio
            </label>
            <textarea
              id="settings-bio"
              className="form-control"
              rows={3}
              maxLength={250}
              placeholder="Tell the community what you are learning, coding, or playing…"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
            <div className="d-flex justify-content-between mt-1">
              <span className="form-text muted small">
                Brief summary displayed on your profile card.
              </span>
              <span className="form-text muted small">{bio.length}/250</span>
            </div>
          </div>

          <div className="mb-2">
            <span className="muted small">
              Member since: <strong>{memberDate}</strong>
            </span>
          </div>

          <button
            type="submit"
            className="btn btn-dark btn-sm px-4 mt-2"
            disabled={saving || !username.trim()}
          >
            {saving ? "Saving Changes…" : "Save Changes"}
          </button>
        </form>
      </section>

      {/* Section C: Appearance */}
      <section className="settings-card mb-4">
        <div className="settings-card-header">
          <div className="settings-icon">🎨</div>
          <div>
            <h3>Appearance</h3>
            <p className="muted small">Customize your viewing theme.</p>
          </div>
        </div>

        <div className="theme-toggle-group mt-3">
          <button
            type="button"
            className={`theme-card-btn ${theme === "light" ? "active" : ""}`}
            onClick={() => handleThemeChange("light")}
          >
            <span className="theme-icon">☀️</span>
            <strong>Light Mode</strong>
            <span className="muted small">Clean green & crisp white palette</span>
          </button>

          <button
            type="button"
            className={`theme-card-btn ${theme === "dark" ? "active" : ""}`}
            onClick={() => handleThemeChange("dark")}
          >
            <span className="theme-icon">🌙</span>
            <strong>Dark Mode</strong>
            <span className="muted small">Deep contrast with lime accents</span>
          </button>
        </div>
      </section>

      {/* Section D: Account Actions */}
      <section className="settings-card mb-4">
        <div className="settings-card-header">
          <div className="settings-icon">🔒</div>
          <div>
            <h3>Account Actions</h3>
            <p className="muted small">Session and security options.</p>
          </div>
        </div>

        <div className="mt-3">
          {!showLogoutConfirm ? (
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              onClick={() => setShowLogoutConfirm(true)}
            >
              Log out of Unfold
            </button>
          ) : (
            <div className="logout-confirm-box p-3 border rounded">
              <p className="mb-2 text-danger small">
                Are you sure you want to end your session?
              </p>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={onLogout}
                >
                  Yes, Log Out
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => setShowLogoutConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
