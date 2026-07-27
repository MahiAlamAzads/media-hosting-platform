"use client";
import { FormEvent, useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Notice } from "@/components/ui";
import { API_URL } from "@/lib/api";

export default function RegisterPage() {
  const [message,setMessage]=useState("");
  const [tone,setTone]=useState<"success"|"error">("success");
  const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const data=new FormData(event.currentTarget);
    const response=await fetch(`${API_URL}/api/v1/auth/register`,{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({name:data.get("name"),email:data.get("email"),password:data.get("password")})
    });
    const payload=await response.json().catch(()=>null);
    setBusy(false); setTone(response.ok?"success":"error");
    setMessage(payload?.data?.message??payload?.error?.message??"Request completed.");
  }
  return <AuthShell title="Create workspace" subtitle="Verify your email before signing in." footer={<span>Already registered? <a href="/auth/login">Sign in</a></span>}>
    <Notice message={message} tone={tone}/>
    <form className="mp-form-grid" style={{gridTemplateColumns:"1fr"}} onSubmit={submit}>
      <div className="mp-field"><label htmlFor="name">Name</label><input id="name" name="name" autoComplete="name" required/></div>
      <div className="mp-field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" required/></div>
      <div className="mp-field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={12} autoComplete="new-password" required/><span className="mp-helper">At least 12 characters with uppercase, lowercase and a number.</span></div>
      <button className="mp-button" data-primary="true" disabled={busy}>{busy?"Creating…":"Create account"}</button>
    </form>
  </AuthShell>;
}
