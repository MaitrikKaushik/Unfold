import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  KeyRound,
  ShieldCheck,
  Sun,
  Moon,
  Bell,
  Lock,
  Mail,
  Smartphone,
  LogOut,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  UserX,
  UserRound,
  Edit3,
  SlidersHorizontal
} from "lucide-react";
import { api, setSession } from "../services/api";
import { AccountSettingsSkeleton } from "./Skeletons";

export default function AccountSettingsView({
  user,
  onUserUpdate,
  onLogout,
  onNavigateToProfile,
  onBackToFeed,
  isLoading = false
}) {
  const [activeTab, setActiveTab] = useState("security"); // "security" | "privacy" | "appearance" | "notifications"

  // Email form state
  const [email, setEmail] = useState(user?.email || "");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState("");
  const [emailError, setEmailError] = useState("");

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdSuccess, setPwdSuccess] = useState("");
  const [pwdError, setPwdError] = useState("");

  // Appearance & Theme state
  const [theme, setTheme] = useState(() => localStorage.getItem("unfold_theme") || "light");

  // Privacy & Notifications state (synced with user.preferences)
  const [dmPermission, setDmPermission] = useState(
    user?.preferences?.privacy?.directMessages || "everyone"
  );
  const [profileVisibility, setProfileVisibility] = useState(
    user?.preferences?.privacy?.profileVisibility || "public"
  );
  const [notifyDMs, setNotifyDMs] = useState(
    user?.preferences?.notifications?.directMessages !== false
  );
  const [notifyCommunity, setNotifyCommunity] = useState(
    user?.preferences?.notifications?.communityActivity !== false
  );
  const [notifyAccount, setNotifyAccount] = useState(
    user?.preferences?.notifications?.accountUpdates !== false
  );
  const [prefSaving, setPrefSaving] = useState(false);
  const [prefSuccess, setPrefSuccess] = useState("");
  const [prefError, setPrefError] = useState("");

  // Blocked users
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);

  // Logout confirmation modal/dialog
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    if (user?.email !== undefined) setEmail(user.email || "");
    if (user?.preferences?.privacy?.directMessages) setDmPermission(user.preferences.privacy.directMessages);
    if (user?.preferences?.privacy?.profileVisibility) setProfileVisibility(user.preferences.privacy.profileVisibility);
    if (user?.preferences?.notifications) {
      setNotifyDMs(user.preferences.notifications.directMessages !== false);
      setNotifyCommunity(user.preferences.notifications.communityActivity !== false);
      setNotifyAccount(user.preferences.notifications.accountUpdates !== false);
    }
  }, [user]);

  // Load blocked users when Privacy tab is selected
  useEffect(() => {
    if (activeTab === "privacy") {
      loadBlockedUsers();
    }
  }, [activeTab]);

  async function loadBlockedUsers() {
    setLoadingBlocked(true);
    try {
      const res = await api("/auth/blocked");
      setBlockedUsers(res?.data?.blocked || []);
    } catch {
      // Ignored
    } finally {
      setLoadingBlocked(false);
    }
  }

  async function handleUnblock(userId) {
    try {
      await api(`/auth/unblock/${userId}`, { method: "POST" });
      setBlockedUsers((prev) => prev.filter((u) => u.id !== userId));
      setPrefSuccess("User unblocked successfully.");
      setTimeout(() => setPrefSuccess(""), 4000);
    } catch (e) {
      setPrefError(e.message || "Failed to unblock user.");
    }
  }

  // Handle email update
  async function handleUpdateEmail(e) {
    e.preventDefault();
    setEmailSaving(true);
    setEmailError("");
    setEmailSuccess("");

    try {
      const res = await api("/auth/settings", {
        method: "PATCH",
        body: JSON.stringify({ email: email.trim() })
      });
      const updatedUser = res.user || res.data?.user;
      if (updatedUser) {
        setSession(undefined, updatedUser);
        onUserUpdate(updatedUser);
      }
      setEmailSuccess("Registered email updated successfully.");
    } catch (err) {
      setEmailError(err.message || "Failed to update email.");
    } finally {
      setEmailSaving(false);
    }
  }

  // Handle password change
  async function handleChangePassword(e) {
    e.preventDefault();
    setPwdSaving(true);
    setPwdError("");
    setPwdSuccess("");

    if (newPassword.length < 8) {
      setPwdError("New password must contain at least 8 characters.");
      setPwdSaving(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwdError("New passwords do not match.");
      setPwdSaving(false);
      return;
    }

    try {
      await api("/auth/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });
      setPwdSuccess("Your password has been changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPwdError(err.message || "Failed to change password.");
    } finally {
      setPwdSaving(false);
    }
  }

  // Handle theme change
  function handleThemeChange(nextTheme) {
    setTheme(nextTheme);
    localStorage.setItem("unfold_theme", nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);

    // Save to user preferences on backend if user is logged in
    api("/auth/settings", {
      method: "PATCH",
      body: JSON.stringify({
        preferences: { theme: nextTheme }
      })
    }).catch(() => {});
  }

  // Handle saving privacy & notifications preferences
  async function savePreferences(updates) {
    setPrefSaving(true);
    setPrefError("");
    setPrefSuccess("");

    try {
      const res = await api("/auth/settings", {
        method: "PATCH",
        body: JSON.stringify({ preferences: updates })
      });
      const updatedUser = res.user || res.data?.user;
      if (updatedUser) {
        setSession(undefined, updatedUser);
        onUserUpdate(updatedUser);
      }
      setPrefSuccess("Preferences saved.");
      setTimeout(() => setPrefSuccess(""), 3500);
    } catch (err) {
      setPrefError(err.message || "Failed to save preferences.");
    } finally {
      setPrefSaving(false);
    }
  }

  function handleDmPermissionChange(val) {
    setDmPermission(val);
    savePreferences({ privacy: { directMessages: val, profileVisibility } });
  }

  function handleProfileVisibilityChange(val) {
    setProfileVisibility(val);
    savePreferences({ privacy: { directMessages: dmPermission, profileVisibility: val } });
  }

  function handleToggleNotification(key, currentVal, setter) {
    const nextVal = !currentVal;
    setter(nextVal);
    savePreferences({
      notifications: {
        directMessages: key === "dms" ? nextVal : notifyDMs,
        communityActivity: key === "comm" ? nextVal : notifyCommunity,
        accountUpdates: key === "acct" ? nextVal : notifyAccount
      }
    });
  }

  if (isLoading) {
    return <AccountSettingsSkeleton />;
  }

  return (
    <div className="account-settings-page">
      <div className="settings-header mb-4">
        <button type="button" className="btn-back-feed" onClick={onBackToFeed} title="Return to feed">
          <ArrowLeft size={16} strokeWidth={2.2} />
          <span>Back to Community Feed</span>
        </button>
        <div className="mt-2">
          <h1 className="page-main-title">Account & Settings</h1>
          <p className="page-sub-title">Manage your profile, security, privacy and platform preferences.</p>
        </div>
      </div>

      {/* Account Management Hub Card */}
      <div className="account-hub-card mb-4">
        <div className="account-hub-header">
          <div className="account-avatar-circle">
            {(user?.displayName || user?.username || "U").slice(0, 1).toUpperCase()}
          </div>
          <div className="account-hub-info">
            <div className="account-hub-name-row">
              <span className="account-hub-display-name">{user?.displayName || user?.username}</span>
              <span className="account-hub-handle">@{user?.username}</span>
            </div>
            <div className="account-hub-meta">
              <span className="account-hub-email-pill">
                <Mail size={12} strokeWidth={2.2} />
                {user?.email || "No email linked"}
              </span>
              <span className="account-hub-role-pill">
                <ShieldCheck size={12} strokeWidth={2.2} />
                {user?.role || "Community Member"}
              </span>
            </div>
          </div>
        </div>
        <div className="account-hub-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm d-flex align-items-center gap-1"
            onClick={onNavigateToProfile}
            title="View your public profile"
          >
            <UserRound size={14} strokeWidth={2.2} />
            <span>My Profile</span>
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm d-flex align-items-center gap-1"
            onClick={onNavigateToProfile}
            title="Edit your bio and display name"
          >
            <Edit3 size={14} strokeWidth={2.2} />
            <span>Edit Profile</span>
          </button>
        </div>
      </div>

      {/* Account Settings Category Header & Tabs */}
      <div className="settings-section-title-wrap mb-2">
        <h2 className="settings-section-heading">Account Settings</h2>
        <span className="settings-section-desc">Configure security credentials, privacy options, theme and alerts</span>
      </div>

      {/* Tabs navigation */}
      <div className="settings-tabs-nav mb-4">
        <button
          type="button"
          className={`settings-tab-btn ${activeTab === "security" ? "active" : ""}`}
          onClick={() => setActiveTab("security")}
        >
          <KeyRound size={15} strokeWidth={2.2} />
          <span>Login & Security</span>
        </button>
        <button
          type="button"
          className={`settings-tab-btn ${activeTab === "privacy" ? "active" : ""}`}
          onClick={() => setActiveTab("privacy")}
        >
          <ShieldCheck size={15} strokeWidth={2.2} />
          <span>Privacy</span>
        </button>
        <button
          type="button"
          className={`settings-tab-btn ${activeTab === "appearance" ? "active" : ""}`}
          onClick={() => setActiveTab("appearance")}
        >
          <Sun size={15} strokeWidth={2.2} />
          <span>Appearance</span>
        </button>
        <button
          type="button"
          className={`settings-tab-btn ${activeTab === "notifications" ? "active" : ""}`}
          onClick={() => setActiveTab("notifications")}
        >
          <Bell size={15} strokeWidth={2.2} />
          <span>Notifications</span>
        </button>
      </div>

      {prefSuccess && (
        <div className="alert alert-success d-flex align-items-center gap-2 mb-3">
          <Check size={16} strokeWidth={2.4} />
          <span>{prefSuccess}</span>
        </div>
      )}

      {prefError && (
        <div className="alert alert-danger d-flex align-items-center gap-2 mb-3">
          <AlertCircle size={16} strokeWidth={2.2} />
          <span>{prefError}</span>
        </div>
      )}

      {/* TAB 1: LOGIN & SECURITY */}
      {activeTab === "security" && (
        <div className="settings-tab-content">
          {/* Registered Email */}
          <section className="settings-card mb-4">
            <div className="settings-card-header">
              <div className="settings-icon">
                <Mail size={18} strokeWidth={2.2} />
              </div>
              <div>
                <h3>Registered Email Address</h3>
                <p className="muted small">
                  Your private email address. You can log in using either this email or your username.
                </p>
              </div>
            </div>

            {emailSuccess && <div className="alert alert-success py-2 mt-3 mb-2">{emailSuccess}</div>}
            {emailError && <div className="alert alert-danger py-2 mt-3 mb-2">{emailError}</div>}

            <form onSubmit={handleUpdateEmail} className="mt-3">
              <div className="mb-3">
                <label className="form-label" htmlFor="settings-email">Email Address</label>
                <div className="input-group">
                  <span className="input-group-text"><Mail size={14} /></span>
                  <input
                    id="settings-email"
                    type="email"
                    className="form-control"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <span className="form-text muted small">
                  Never visible to other members. Used for account recovery and dual username/email login.
                </span>
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-sm px-4"
                disabled={emailSaving}
              >
                {emailSaving ? "Saving email..." : "Update email"}
              </button>
            </form>
          </section>

          {/* Change Password */}
          <section className="settings-card mb-4">
            <div className="settings-card-header">
              <div className="settings-icon">
                <Lock size={18} strokeWidth={2.2} />
              </div>
              <div>
                <h3>Change Password</h3>
                <p className="muted small">Ensure your account is protected with a strong, distinct password.</p>
              </div>
            </div>

            {pwdSuccess && <div className="alert alert-success py-2 mt-3 mb-2">{pwdSuccess}</div>}
            {pwdError && <div className="alert alert-danger py-2 mt-3 mb-2">{pwdError}</div>}

            <form onSubmit={handleChangePassword} className="mt-3">
              <div className="mb-3">
                <label className="form-label" htmlFor="current-pwd">Current Password</label>
                <input
                  id="current-pwd"
                  type={showPassword ? "text" : "password"}
                  className="form-control"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>

              <div className="row g-2 mb-3">
                <div className="col-12 col-md-6">
                  <label className="form-label" htmlFor="new-pwd">New Password</label>
                  <input
                    id="new-pwd"
                    type={showPassword ? "text" : "password"}
                    className="form-control"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label" htmlFor="confirm-pwd">Confirm New Password</label>
                  <input
                    id="confirm-pwd"
                    type={showPassword ? "text" : "password"}
                    className="form-control"
                    placeholder="Re-type new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
              </div>

              <div className="d-flex align-items-center justify-content-between">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
                  onClick={() => setShowPassword((p) => !p)}
                >
                  {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  <span>{showPassword ? "Hide passwords" : "Show passwords"}</span>
                </button>

                <button
                  type="submit"
                  className="btn btn-primary btn-sm px-4"
                  disabled={pwdSaving || !currentPassword || !newPassword}
                >
                  {pwdSaving ? "Changing..." : "Change password"}
                </button>
              </div>
            </form>
          </section>

          {/* Active Sessions */}
          <section className="settings-card mb-4">
            <div className="settings-card-header">
              <div className="settings-icon">
                <Smartphone size={18} strokeWidth={2.2} />
              </div>
              <div>
                <h3>Active Session</h3>
                <p className="muted small">Your current authenticated session.</p>
              </div>
            </div>

            <div className="session-item mt-3 d-flex align-items-center justify-content-between p-3 rounded">
              <div className="d-flex align-items-center gap-3">
                <div className="session-device-icon">
                  <Smartphone size={18} />
                </div>
                <div>
                  <div className="session-name font-weight-bold">Web Browser on macOS</div>
                  <div className="muted small">Current device · Active session</div>
                </div>
              </div>
              <span className="badge-active-session">
                <Check size={12} strokeWidth={2.4} /> Active
              </span>
            </div>

            <div className="mt-3 pt-3 border-top border-subtle d-flex justify-content-between align-items-center">
              <span className="muted small">Ready to sign out on this device?</span>
              <button
                type="button"
                className="btn btn-outline-danger btn-sm d-flex align-items-center gap-1"
                onClick={() => setShowLogoutConfirm(true)}
              >
                <LogOut size={13} strokeWidth={2.2} />
                <span>Log Out</span>
              </button>
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: PRIVACY */}
      {activeTab === "privacy" && (
        <div className="settings-tab-content">
          <section className="settings-card mb-4">
            <div className="settings-card-header">
              <div className="settings-icon">
                <ShieldCheck size={18} strokeWidth={2.2} />
              </div>
              <div>
                <h3>Direct Message Permissions</h3>
                <p className="muted small">Control who can initiate private conversations with you.</p>
              </div>
            </div>

            <div className="privacy-options-list mt-3 d-flex flex-column gap-2">
              <label className={`radio-setting-card ${dmPermission === "everyone" ? "active" : ""}`}>
                <input
                  type="radio"
                  name="dmPermission"
                  value="everyone"
                  checked={dmPermission === "everyone"}
                  onChange={() => handleDmPermissionChange("everyone")}
                />
                <div className="radio-content">
                  <strong>Everyone</strong>
                  <span className="muted small d-block">Any active Unfold member can message you.</span>
                </div>
              </label>

              <label className={`radio-setting-card ${dmPermission === "none" ? "active" : ""}`}>
                <input
                  type="radio"
                  name="dmPermission"
                  value="none"
                  checked={dmPermission === "none"}
                  onChange={() => handleDmPermissionChange("none")}
                />
                <div className="radio-content">
                  <strong>No one</strong>
                  <span className="muted small d-block">Disable new incoming direct messages.</span>
                </div>
              </label>
            </div>
          </section>

          {/* Blocked Users Section */}
          <section className="settings-card mb-4">
            <div className="settings-card-header">
              <div className="settings-icon">
                <UserX size={18} strokeWidth={2.2} />
              </div>
              <div>
                <h3>Blocked Users</h3>
                <p className="muted small">Blocked accounts cannot message you or participate in discussions with you.</p>
              </div>
            </div>

            <div className="mt-3">
              {loadingBlocked ? (
                <div className="muted small py-2">Loading blocked users...</div>
              ) : blockedUsers.length === 0 ? (
                <div className="muted small py-3 text-center border rounded border-subtle">
                  You have not blocked any users.
                </div>
              ) : (
                <div className="blocked-users-list d-flex flex-column gap-2">
                  {blockedUsers.map((b) => (
                    <div key={b.id} className="d-flex align-items-center justify-content-between p-2 rounded border border-subtle">
                      <div>
                        <strong>{b.displayName || b.username}</strong>
                        <span className="muted small ms-2">@{b.username}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => handleUnblock(b.id)}
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: APPEARANCE */}
      {activeTab === "appearance" && (
        <div className="settings-tab-content">
          <section className="settings-card mb-4">
            <div className="settings-card-header">
              <div className="settings-icon">
                <Sun size={18} strokeWidth={2.2} />
              </div>
              <div>
                <h3>Theme Preference</h3>
                <p className="muted small">Select between the two official Peachy Community color palettes.</p>
              </div>
            </div>

            <div className="theme-toggle-group mt-3">
              <button
                type="button"
                className={`theme-card-btn ${theme === "light" ? "active" : ""}`}
                onClick={() => handleThemeChange("light")}
              >
                <span className="theme-icon">
                  <Sun size={20} strokeWidth={2.2} />
                </span>
                <strong>Light mode</strong>
                <span className="muted small">Warm cream, peach and lavender canvas</span>
              </button>

              <button
                type="button"
                className={`theme-card-btn ${theme === "dark" ? "active" : ""}`}
                onClick={() => handleThemeChange("dark")}
              >
                <span className="theme-icon">
                  <Moon size={20} strokeWidth={2.2} />
                </span>
                <strong>Dark mode</strong>
                <span className="muted small">Deep plum with soft pastel accents</span>
              </button>
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: NOTIFICATIONS */}
      {activeTab === "notifications" && (
        <div className="settings-tab-content">
          <section className="settings-card mb-4">
            <div className="settings-card-header">
              <div className="settings-icon">
                <Bell size={18} strokeWidth={2.2} />
              </div>
              <div>
                <h3>Notification Preferences</h3>
                <p className="muted small">Choose which updates and alerts you wish to receive.</p>
              </div>
            </div>

            <div className="notification-toggles-list mt-3 d-flex flex-column gap-3">
              <div className="toggle-row d-flex align-items-center justify-content-between p-3 rounded border border-subtle">
                <div>
                  <div className="font-weight-bold">Direct Messages</div>
                  <div className="muted small">Receive notifications when someone sends you a private message.</div>
                </div>
                <button
                  type="button"
                  className={`switch-toggle ${notifyDMs ? "on" : "off"}`}
                  onClick={() => handleToggleNotification("dms", notifyDMs, setNotifyDMs)}
                  role="switch"
                  aria-checked={notifyDMs}
                  aria-label="Direct message notifications"
                >
                  <span className="switch-slider" />
                </button>
              </div>

              <div className="toggle-row d-flex align-items-center justify-content-between p-3 rounded border border-subtle">
                <div>
                  <div className="font-weight-bold">Community Activity</div>
                  <div className="muted small">Alerts for replies, upvotes, and mentions in communities you joined.</div>
                </div>
                <button
                  type="button"
                  className={`switch-toggle ${notifyCommunity ? "on" : "off"}`}
                  onClick={() => handleToggleNotification("comm", notifyCommunity, setNotifyCommunity)}
                  role="switch"
                  aria-checked={notifyCommunity}
                  aria-label="Community activity notifications"
                >
                  <span className="switch-slider" />
                </button>
              </div>

              <div className="toggle-row d-flex align-items-center justify-content-between p-3 rounded border border-subtle">
                <div>
                  <div className="font-weight-bold">Important Account Notifications</div>
                  <div className="muted small">Security alerts, password changes, and essential platform updates.</div>
                </div>
                <button
                  type="button"
                  className={`switch-toggle ${notifyAccount ? "on" : "off"}`}
                  onClick={() => handleToggleNotification("acct", notifyAccount, setNotifyAccount)}
                  role="switch"
                  aria-checked={notifyAccount}
                  aria-label="Account notifications"
                >
                  <span className="switch-slider" />
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Dedicated Session & Security Section */}
      <section className="settings-card session-security-section mt-4 mb-4">
        <div className="settings-card-header">
          <div className="settings-icon">
            <ShieldCheck size={18} strokeWidth={2.2} />
          </div>
          <div>
            <h3>Session & Security</h3>
            <p className="muted small">Review your authenticated session details and active device status.</p>
          </div>
        </div>

        <div className="session-security-content mt-3">
          <div className="session-info-card">
            <div className="session-info-main">
              <div className="session-device-badge">
                <Smartphone size={20} strokeWidth={2.2} />
              </div>
              <div className="session-details">
                <div className="session-title-row">
                  <span className="session-device-name">Current Active Session</span>
                  <span className="session-live-pill">Active</span>
                </div>
                <div className="session-meta-row">
                  <span className="session-meta-item">Signed in as <strong>@{user?.username}</strong></span>
                  {user?.email && <span className="session-meta-item">({user.email})</span>}
                  <span className="session-meta-bullet">·</span>
                  <span className="session-meta-item">Web Client</span>
                </div>
              </div>
            </div>

            <div className="session-action-wrap">
              <button
                type="button"
                className="btn-logout-subtle"
                onClick={() => setShowLogoutConfirm(true)}
                title="Log out of your account"
              >
                <LogOut size={15} strokeWidth={2.2} />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="logout-dialog-title">
          <div className="logout-confirm-card">
            <div className="logout-confirm-header">
              <div className="logout-confirm-icon-wrap">
                <LogOut size={20} strokeWidth={2.2} />
              </div>
              <div>
                <h4 id="logout-dialog-title" className="logout-confirm-title">Log out of Unfold?</h4>
                <p className="logout-confirm-desc">
                  You will need to sign in again to access your account.
                </p>
              </div>
            </div>
            <div className="d-flex justify-content-end gap-2 mt-4">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-logout-confirm btn-sm"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  onLogout();
                }}
              >
                <LogOut size={14} strokeWidth={2.2} />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
