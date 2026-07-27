"use client";
import { FormEvent,useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Notice } from "@/components/ui";
import { API_URL } from "@/lib/api";
export function ResetPasswordClient(){const q=useSearchParams();const[m,setM]=useState("");const[t,setT]=useState<"success"|"error">("success");const[busy,setBusy]=useState(false);
async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const token=q.get("token");if(!token){setT("error");setM("Reset token is missing.");return}setBusy(true);const f=new FormData(e.currentTarget);const r=await fetch(`${API_URL}/api/v1/auth/reset-password`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token,password:f.get("password")})});const p=await r.json();setBusy(false);setT(r.ok?"success":"error");setM(r.ok?"Password changed. Sign in again.":p.error?.message??"Reset failed.")}
return <AuthShell title="Choose a new password" subtitle="Existing sessions will be revoked." footer={<a href="/auth/login">Back to sign in</a>}><Notice message={m} tone={t}/><form className="mp-form-grid" style={{gridTemplateColumns:"1fr"}} onSubmit={submit}><div className="mp-field"><label htmlFor="password">New password</label><input id="password" name="password" type="password" minLength={12} required/><span className="mp-helper">At least 12 characters with uppercase, lowercase and a number.</span></div><button className="mp-button" data-primary="true" disabled={busy}>{busy?"Changing…":"Change password"}</button></form></AuthShell>}
