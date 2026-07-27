"use client";
import { FormEvent, useEffect, useState } from "react";
import { apiRequest, logout } from "@/lib/api";

type Session={id:string;userAgent:string|null;ipAddress:string|null;createdAt:string;lastUsedAt:string|null;expiresAt:string;current:boolean};

export default function SecurityPage(){
  const [sessions,setSessions]=useState<Session[]>([]); const [message,setMessage]=useState("");
  const load=()=>apiRequest<{data:Session[]}>("/api/v1/security/sessions").then(r=>setSessions(r.data)).catch(e=>setMessage(e.message));
  useEffect(()=>{load()},[]);
  async function changePassword(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);
    await apiRequest("/api/v1/security/change-password",{method:"POST",body:JSON.stringify({currentPassword:f.get("currentPassword"),newPassword:f.get("newPassword")})});
    setMessage("Password changed. Other sessions were revoked."); e.currentTarget.reset(); load();
  }
  async function revoke(id:string){await apiRequest(`/api/v1/security/sessions/${id}`,{method:"DELETE"});load();}
  async function logoutAll(){await apiRequest("/api/v1/security/logout-all",{method:"POST"});await logout();window.location.assign("/auth/login");}
  return <section className="content"><div className="page-heading"><div><h1>Security</h1><p className="muted">Password and active sessions.</p></div></div>
    {message&&<div className="notice">{message}</div>}
    <div className="settings-grid"><form className="card" onSubmit={changePassword}><h2>Change password</h2>
      <label className="field">Current password<input name="currentPassword" type="password" required /></label>
      <label className="field">New password<input name="newPassword" type="password" minLength={12} required /></label>
      <button className="secondary">Update password</button></form>
      <div className="card"><div className="card-heading"><h2>Active sessions</h2><button className="danger-button" onClick={logoutAll}>Log out all</button></div>
        <div className="data-list">{sessions.map(s=><div className="data-row" key={s.id}><div><strong>{s.current?"Current session":"Session"}</strong><div className="muted">{s.userAgent??"Unknown device"} · {s.ipAddress??"Unknown IP"}</div></div>{!s.current&&<button className="small-button" onClick={()=>revoke(s.id)}>Revoke</button>}</div>)}</div>
      </div></div>
  </section>;
}
