"use client";
import { FormEvent,useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Feedback } from "@/components/feedback";
import { API_URL } from "@/lib/api";
export default function Page(){const [message,setMessage]=useState("");
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const r=await fetch(`${API_URL}/api/v1/auth/forgot-password`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:f.get("email")})});const p=await r.json();setMessage(p.data?.message??p.error?.message)}
 return <AuthShell title="Reset password" subtitle="We will send a short-lived reset link." footer={<a href="/auth/login">Back to sign in</a>}><Feedback message={message} variant="info"/><form onSubmit={submit}><div className="mb-3"><label className="form-label">Email address</label><input className="form-control" name="email" type="email" required/></div><button className="btn btn-primary w-100">Send reset link</button></form></AuthShell>}
