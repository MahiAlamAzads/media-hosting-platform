"use client";
import { FormEvent, useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Feedback } from "@/components/feedback";
import { API_URL, setAccessToken } from "@/lib/api";

export default function LoginPage() {
  const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); setBusy(true); setMessage("");
    const f=new FormData(e.currentTarget);
    const r=await fetch(`${API_URL}/api/v1/auth/login`,{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({email:f.get("email"),password:f.get("password")})});
    const p=await r.json().catch(()=>null); setBusy(false);
    if(!r.ok){setMessage(p?.error?.message??"Sign in failed.");return}
    setAccessToken(p.data.accessToken); window.location.assign("/dashboard");
  }
  return <AuthShell title="Welcome back" subtitle="Sign in to your media workspace." footer={<span>New here? <a href="/auth/register">Create an account</a></span>}>
    <Feedback message={message} variant="danger" onClose={()=>setMessage("")}/>
    <form onSubmit={submit}>
      <div className="mb-3"><label className="form-label">Email address</label><input className="form-control" name="email" type="email" autoComplete="email" required /></div>
      <div className="mb-3"><div className="d-flex justify-content-between"><label className="form-label">Password</label><a className="small" href="/auth/forgot-password">Forgot password?</a></div><input className="form-control" name="password" type="password" autoComplete="current-password" required /></div>
      <button className="btn btn-primary w-100" disabled={busy}>{busy?<><span className="spinner-border spinner-border-sm me-2"/>Signing in…</>:"Sign in"}</button>
    </form>
  </AuthShell>;
}
