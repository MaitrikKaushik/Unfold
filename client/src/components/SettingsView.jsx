import React, { useState, useEffect } from "react";
import { api, setSession, getToken } from "../services/api";

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

  // Data persistence & backup states
  const [dataStats, setDataStats] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreData, setRestoreData] = useState(null);
  const [restoreFileName, setRestoreFileName] = useState("");
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  useEffect(() => {
    fetchDataStatus();
  }, []);

  async function fetchDataStatus() {
    try {
      const res = await api("/data/status");
      setDataStats(res);
    } catch {
      // Non-fatal if status call fails
    }
  }

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

  async function handleExportBackup() {
    setIsExporting(true);
    setError("");
    setSuccess("");
    try {
      const data = await api("/data/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `unfold-backup-${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setSuccess("Backup downloaded successfully. You can use this file to restore your data on any deployment.");
    } catch (err) {
      setError(`Failed to export backup: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setSuccess("");
    setRestoreFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (!parsed || typeof parsed !== "object") {
          throw new Error("File content is not a valid JSON object.");
        }
        setRestoreData(parsed);
      } catch (err) {
        setError(`Invalid backup file: ${err.message}`);
        setRestoreData(null);
        setRestoreFileName("");
      }
    };
    reader.onerror = () => {
      setError("Error reading backup file.");
      setRestoreData(null);
    };
    reader.readAsText(file);
  }

  async function handleRestoreDatabase() {
    if (!restoreData) return;
    setIsRestoring(true);
    setError("");
    setSuccess("");

    try {
      const res = await api("/data/restore", {
        method: "POST",
        body: JSON.stringify({ data: restoreData })
      });

      setShowRestoreConfirm(false);
      setRestoreData(null);
      setRestoreFileName("");
      setSuccess(
        `Database restored successfully! (${res.stats?.users || 0} users, ${res.stats?.posts || 0} posts, ${res.stats?.comments || 0} comments)`
      );
      await fetchDataStatus();
    } catch (err) {
      setError(`Database restore failed: ${err.message}`);
    } finally {
      setIsRestoring(false);
    }
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

      {/* Section D: Database & Data Persistence */}
      <section className="settings-card mb-4">
        <div className="settings-card-header">
          <div className="settings-icon">💾</div>
          <div>
            <h3>Database & Persistence</h3>
            <p className="muted small">Manage JSON file backups and survive cloud redeployments.</p>
          </div>
        </div>

        <div className="mt-3">
          <div className="persistence-status-box p-3 mb-3 border rounded">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="small text-muted">Storage Engine</span>
              <span className={`badge ${dataStats?.isPersistent ? "bg-success" : "bg-secondary"}`}>
                {dataStats?.isPersistent ? "✓ Persistent Disk Volume" : "Local JSON Store"}
              </span>
            </div>
            {dataStats?.stats && (
              <div className="d-flex gap-3 small text-muted">
                <span>👥 {dataStats.stats.users} Users</span>
                <span>📝 {dataStats.stats.posts} Posts</span>
                <span>💬 {dataStats.stats.comments} Comments</span>
              </div>
            )}
            <p className="small muted mt-2 mb-0">
              Cloud hosts (like Render free tier) use ephemeral containers that reset on redeploy.
              Use the backup tool below to safeguard your data, or mount a Render Disk with <code>DATA_DIR=/var/data</code>.
            </p>
          </div>

          <div className="d-flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              className="btn btn-outline-dark btn-sm"
              onClick={handleExportBackup}
              disabled={isExporting}
            >
              {isExporting ? "Generating Backup…" : "⬇ Export Database Backup (JSON)"}
            </button>
          </div>

          <div className="restore-box p-3 border rounded">
            <label className="form-label small fw-bold mb-1" htmlFor="backup-file-input">
              Restore Database from Backup File
            </label>
            <input
              id="backup-file-input"
              type="file"
              accept=".json,application/json"
              className="form-control form-control-sm mb-2"
              onChange={handleFileSelect}
            />

            {restoreFileName && (
              <div className="d-flex align-items-center gap-2 mt-2">
                {!showRestoreConfirm ? (
                  <button
                    type="button"
                    className="btn btn-warning btn-sm"
                    disabled={!restoreData || isRestoring}
                    onClick={() => setShowRestoreConfirm(true)}
                  >
                    Restore Database
                  </button>
                ) : (
                  <div className="d-flex align-items-center gap-2">
                    <span className="small text-danger fw-semibold">
                      Overwrite existing store with backup?
                    </span>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={isRestoring}
                      onClick={handleRestoreDatabase}
                    >
                      {isRestoring ? "Restoring…" : "Yes, Restore Now"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => setShowRestoreConfirm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Section E: Account Actions */}
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
