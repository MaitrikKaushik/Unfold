import React from "react";
import { useState } from "react";
import { api, setSession } from "../services/api";


export default function AuthPanel({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const body = mode === "register"
        ? { username: form.username, email: form.email, password: form.password }
        : { login: form.username, password: form.password };
      const data = await api(`/auth/${mode === "register" ? "register" : "login"}`, {
        method: "POST", body: JSON.stringify(body)
      });
      setSession(data.token, data.user); onAuth(data.user);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <div className="auth-wrap">
    <div className="auth-card">
      <div className="brand-mark">c.</div>
      <p className="eyebrow">A COMMUNITY THAT YOU EARN</p>
      <h1>{mode === "login" ? "Welcome back." : "Find your people."}</h1>
      <p className="muted">Join conversations. Build trust through contributions.</p>
      <form onSubmit={submit} className="mt-4">
        {mode === "register" && <>
          <label className="form-label">Username</label>
          <input className="form-control mb-3" required minLength="3" maxLength="24" value={form.username} onChange={e => setForm({...form, username:e.target.value})} />
          <label className="form-label">Email</label>
          <input type="email" className="form-control mb-3" required value={form.email} onChange={e => setForm({...form, email:e.target.value})} />
        </>}
        {mode === "login" && <>
          <label className="form-label">Username or email</label>
          <input className="form-control mb-3" required value={form.username} onChange={e => setForm({...form, username:e.target.value})} />
        </>}
        <label className="form-label">Password</label>
        <input type="password" className="form-control mb-3" required minLength={mode === "register" ? 8 : undefined} value={form.password} onChange={e => setForm({...form, password:e.target.value})} />
        {error && <div className="alert alert-danger py-2">{error}</div>}
        <button className="btn btn-dark w-100 py-2" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</button>
      </form>
      <p className="text-center mt-3 mb-0 small muted">
        {mode === "login" ? "New here?" : "Already have an account?"}{" "}
        <button className="link-button" onClick={() => {setMode(mode === "login" ? "register" : "login");setError("");}}>
          {mode === "login" ? "Create an account" : "Log in"}
        </button>
      </p>
      <div className="privacy-note"><span>◉</span> Start pseudonymously. Your real name is never required here.</div>
    </div>
  </div>;
}
