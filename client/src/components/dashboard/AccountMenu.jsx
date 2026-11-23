import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

/**
 * Shared account identity used by the header trigger and the sidebar footer.
 * Keeping this presentation in one place prevents the two surfaces from
 * drifting apart in spacing, typography, or fallback copy.
 */
export function AccountIdentity({ user, compact = false }) {
  const initial = (user.username || "?").slice(0, 1).toUpperCase();

  return (
    <>
      <span className="avatar avatar-nav">{initial}</span>
      <span className="account-meta">
        <strong>{user.username}</strong>
        {!compact && <small>{user.email || `@${user.username}`}</small>}
      </span>
    </>
  );
}

/**
 * Header-only profile menu. It exposes account details and a profile action;
 * Settings and Log out live exclusively in the sidebar MORE section.
 */
export default function AccountMenu({ user, onEditProfile }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handleOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
    }
    function handleKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const initial = (user.username || "?").slice(0, 1).toUpperCase();

  return (
    <div className="user-menu-wrap" ref={menuRef}>
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${user.username}`}
        title="Account details"
      >
        <AccountIdentity user={user} compact />
        <Icon name="chevron" size={14} className="user-menu-chevron" />
      </button>

      {open && (
        <div className="user-menu" role="menu" aria-label="Account details">
          <div className="user-menu-head">
            <span className="avatar avatar-menu">{initial}</span>
            <div>
              <strong>{user.username}</strong>
              <small>{user.email || "Community member"}</small>
            </div>
          </div>
          <div className="user-menu-divider" />
          <button
            type="button"
            role="menuitem"
            className="user-menu-item"
            onClick={() => {
              setOpen(false);
              onEditProfile();
            }}
          >
            <Icon name="user" size={16} />
            Edit profile
          </button>
        </div>
      )}
    </div>
  );
}
