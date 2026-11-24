import React, { useState, useEffect } from "react";
import { ArrowLeft, UserRound, Lock, Check, Sparkles, Shield, AlertCircle, Settings } from "lucide-react";
import { api, setSession } from "../services/api";
import { ProfilePageSkeleton } from "./Skeletons";

export default function ProfileView({
  user,
  onUserUpdate,
  onNavigateToSettings,
  onBackToFeed,
  isLoading = false
}) {
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || "");
      setBio(user.bio || "");
      setDirty(false);
    }
  }, [user]);

  function handleDisplayNameChange(e) {
    setDisplayName(e.target.value);
    setDirty(true);
    setError("");
    setSuccess("");
  }

  function handleBioChange(e) {
    setBio(e.target.value);
    setDirty(true);
    setError("");
    setSuccess("");
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    if (!dirty && !error) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const result = await api("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: displayName.trim(),
          bio: bio.trim()
        })
      });

      const updatedUser = result.user || result.data?.user;
      if (!updatedUser) throw new Error("The server did not return an updated profile.");

      setSession(undefined, updatedUser);
      onUserUpdate(updatedUser);
      setDirty(false);
      setSuccess("Your public profile has been updated.");
    } catch (err) {
      setError(err.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return <ProfilePageSkeleton />;
  }

  const memberDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" })
    : "Recently";

  const userInitial = ((displayName || user?.username || "U").slice(0, 1)).toUpperCase();

  return (
    <div className="profile-page">
      <div className="profile-header mb-4">
        <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
          <button type="button" className="btn-back-feed" onClick={onBackToFeed} title="Return to feed">
            <ArrowLeft size={16} strokeWidth={2.2} />
            <span>Back to Community Feed</span>
          </button>
          {onNavigateToSettings && (
            <button
              type="button"
              className="btn-back-feed"
              onClick={onNavigateToSettings}
              title="Go to Account & Settings"
            >
              <Settings size={16} strokeWidth={2.2} />
              <span>Account Settings</span>
            </button>
          )}
        </div>
        <div className="d-flex align-items-center justify-content-between mt-1">
          <div>
            <h1 className="page-main-title">My Profile</h1>
            <p className="page-sub-title">Manage how you appear across the Unfold community.</p>
          </div>
          {dirty && (
            <span className="badge-unsaved">
              <AlertCircle size={13} strokeWidth={2.2} />
              Unsaved changes
            </span>
          )}
        </div>
      </div>

      {success && (
        <div className="alert alert-success d-flex align-items-center gap-2 mb-3">
          <Check size={16} strokeWidth={2.4} />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="alert alert-danger d-flex align-items-center gap-2 mb-3">
          <AlertCircle size={16} strokeWidth={2.2} />
          <span>{error}</span>
        </div>
      )}

      <div className="profile-layout-grid">
        {/* Left Column: Edit Form */}
        <div className="profile-edit-col">
          <section className="settings-card mb-4">
            <div className="settings-card-header">
              <div className="settings-icon">
                <UserRound size={18} strokeWidth={2.2} />
              </div>
              <div>
                <h3>Public Identity</h3>
                <p className="muted small">Your pseudonymous persona for public posts and interactions.</p>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="mt-3">
              <div className="mb-3">
                <label className="form-label" htmlFor="profile-username">
                  Username
                  <span className="badge-lock-pill ms-2">
                    <Lock size={11} strokeWidth={2.4} /> Read-only
                  </span>
                </label>
                <div className="input-group">
                  <span className="input-group-text">@</span>
                  <input
                    id="profile-username"
                    className="form-control bg-subtle"
                    value={user?.username || ""}
                    readOnly
                    disabled
                  />
                </div>
                <span className="form-text muted small">
                  Your username is generated by Unfold and stays permanent to preserve trust and reputation.
                </span>
              </div>

              <div className="mb-3">
                <label className="form-label" htmlFor="profile-display-name">Display Name</label>
                <input
                  id="profile-display-name"
                  className="form-control"
                  maxLength={40}
                  placeholder="What should people call you?"
                  value={displayName}
                  onChange={handleDisplayNameChange}
                />
                <span className="form-text muted small">Shown as your primary public name in feeds and discussions.</span>
              </div>

              <div className="mb-3">
                <label className="form-label" htmlFor="profile-bio">Bio</label>
                <textarea
                  id="profile-bio"
                  className="form-control"
                  rows={3}
                  maxLength={250}
                  placeholder="A little about your interests, background, or what you're building..."
                  value={bio}
                  onChange={handleBioChange}
                />
                <div className="d-flex justify-content-between mt-1">
                  <span className="form-text muted small">A short bio visible on your community profile.</span>
                  <span className="form-text muted small">{bio.length}/250</span>
                </div>
              </div>

              <div className="profile-meta-row mb-3">
                <span className="muted small">Member since: <strong>{memberDate}</strong></span>
              </div>

              <div className="d-flex align-items-center gap-2">
                <button
                  type="submit"
                  className="btn btn-primary btn-sm px-4"
                  disabled={saving || !dirty}
                >
                  {saving ? "Saving changes..." : "Save changes"}
                </button>
                {dirty && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => {
                      setDisplayName(user?.displayName || "");
                      setBio(user?.bio || "");
                      setDirty(false);
                      setError("");
                    }}
                  >
                    Discard
                  </button>
                )}
              </div>
            </form>
          </section>
        </div>

        {/* Right Column: Public Profile Preview */}
        <div className="profile-preview-col">
          <div className="settings-card public-preview-card">
            <div className="preview-card-top-label">
              <Sparkles size={14} strokeWidth={2.2} />
              <span>PUBLIC PREVIEW</span>
            </div>
            <p className="muted small mb-3">How other members see you across Unfold communities:</p>

            <div className="profile-preview-body text-center p-3">
              <div className="profile-avatar-large mx-auto mb-3">
                {userInitial}
              </div>
              <h3 className="profile-preview-name mb-1">
                {displayName.trim() || user?.username || "Community Member"}
              </h3>
              <div className="profile-preview-handle mb-3">
                @{user?.username}
              </div>

              <p className="profile-preview-bio mb-3">
                {bio.trim() || <em className="muted">No public bio added yet.</em>}
              </p>

              <div className="preview-stats-row mb-3">
                <div className="preview-stat-box">
                  <span className="stat-num">{user?.stats?.publishedPosts || 0}</span>
                  <span className="stat-label">Posts</span>
                </div>
                <div className="preview-stat-box">
                  <span className="stat-num">{user?.stats?.followers || 0}</span>
                  <span className="stat-label">Followers</span>
                </div>
              </div>

              <div className="preview-privacy-guarantee">
                <Shield size={13} strokeWidth={2.2} />
                <span>Private details like your email are never publicly displayed.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
