"use client";
import { useEffect,useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Feedback } from "@/components/feedback";
import { API_URL } from "@/lib/api";
export default function Page(){const q=useSearchParams();const [message,setMessage]=useState("Processing…");const [variant,setVariant]=useState<"info"|"success"|"danger">("info");
 useEffect(()=>{const token=q.get("token");if(!token){setVariant("danger");setMessage("Token is missing.");return}fetch(`${API_URL}/api/v1/auth/verify-email`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token})}).then(async r=>{const p=await r.json();setVariant(r.ok?"success":"danger");setMessage(r.ok?"Email verified. You can now sign in.":p.error?.message??"Request failed.")})},[q]);
 return <AuthShell title="Verify email" subtitle="Secure account confirmation."><Feedback message={message} variant={variant}/><a className="btn btn-primary w-100" href="/auth/login">Go to sign in</a></AuthShell>}
