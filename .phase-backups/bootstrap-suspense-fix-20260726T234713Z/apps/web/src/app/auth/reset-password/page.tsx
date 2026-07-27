"use client";
import { FormEvent,useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Feedback } from "@/components/feedback";
import { API_URL } from "@/lib/api";
export default function Page(){const q=useSearchParams();const [message,setMessage]=useState("");const [variant,setVariant]=useState<"success"|"danger">("success");
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const r=await fetch(`${API_URL}/api/v1/auth/reset-password`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:q.get("token"),password:f.get("password")})});const p=await r.json();setVariant(r.ok?"success":"danger");setMessage(r.ok?"Password changed. Sign in again.":p.error?.message??"Reset failed.")}
 return <AuthShell title="Choose a new password" subtitle="All existing sessions will be revoked." footer={<a href="/auth/login">Go to sign in</a>}><Feedback message={message} variant={variant}/><form onSubmit={submit}><div className="mb-3"><label className="form-label">New password</label><input className="form-control" name="password" type="password" minLength={12} required/><div className="form-text">12+ characters with uppercase, lowercase and a number.</div></div><button className="btn btn-primary w-100">Change password</button></form></AuthShell>}
