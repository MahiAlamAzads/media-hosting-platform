"use client";
import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

type Me = { id:string; name:string; email:string; emailVerifiedAt:string|null; memberships:Array<{role:string;workspace:{name:string;slug:string}}> };

export default function AccountPage() {
  const [me, setMe] = useState<Me|null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { apiRequest<{data:Me}>("/api/v1/account/me").then(r=>setMe(r.data)).catch(e=>setMessage(e.message)); }, []);
  async function profile(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f=new FormData(event.currentTarget);
    const r=await apiRequest<{data:Me}>("/api/v1/account/profile",{method:"PATCH",body:JSON.stringify({name:f.get("name")})});
    setMe(current=>current?{...current,name:r.data.name}:current); setMessage("Profile updated.");
  }
  async function email(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const f=new FormData(event.currentTarget);
    await apiRequest("/api/v1/account/change-email",{method:"POST",body:JSON.stringify({newEmail:f.get("newEmail"),currentPassword:f.get("currentPassword")})});
    setMessage("Confirmation sent to the new email address.");
  }
  return <section className="content">
    <div className="page-heading"><div><h1>Account</h1><p className="muted">Profile and verified email.</p></div></div>
    {message && <div className="notice">{message}</div>}
    <div className="settings-grid">
      <form className="card" onSubmit={profile}><h2>Profile</h2>
        <label className="field">Name<input name="name" defaultValue={me?.name ?? ""} required /></label>
        <label className="field">Current email<input value={me?.email ?? ""} disabled /></label>
        <button className="secondary">Save profile</button>
      </form>
      <form className="card" onSubmit={email}><h2>Change email</h2>
        <label className="field">New email<input name="newEmail" type="email" required /></label>
        <label className="field">Current password<input name="currentPassword" type="password" required /></label>
        <button className="secondary">Send confirmation</button>
      </form>
    </div>
  </section>;
}
