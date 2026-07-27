"use client";
import { FormEvent,useState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Notice } from "@/components/ui";
import { API_URL } from "@/lib/api";
export default function Page(){const[m,setM]=useState("");async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const r=await fetch(`${API_URL}/api/v1/auth/forgot-password`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:f.get("email")})});const p=await r.json();setM(p.data?.message??p.error?.message)}
return <AuthShell title="Reset password" subtitle="We will send a short-lived reset link." footer={<a href="/auth/login">Back to sign in</a>}><Notice message={m}/><form className="mp-form-grid" style={{gridTemplateColumns:"1fr"}} onSubmit={submit}><div className="mp-field"><label htmlFor="email">Email address</label><input id="email" className="vbg-input" name="email" type="email" required/></div><button className="mp-button" data-primary="true">Send reset link</button></form></AuthShell>}
