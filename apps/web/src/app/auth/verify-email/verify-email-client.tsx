"use client";
import { useEffect,useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Notice } from "@/components/ui";
import { API_URL } from "@/lib/api";
export function VerifyEmailClient(){const q=useSearchParams();const[m,setM]=useState("Processing…");const[t,setT]=useState<"info"|"success"|"error">("info");
useEffect(()=>{const token=q.get("token");if(!token){setT("error");setM("Token is missing.");return}void fetch(`${API_URL}/api/v1/auth/verify-email`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token})}).then(async r=>{const p=await r.json();setT(r.ok?"success":"error");setM(r.ok?"Email verified. You can sign in.":p.error?.message??"Request failed.")})},[q]);
return <AuthShell title="Verify email" subtitle="Confirming your account."><Notice message={m} tone={t}/><a className="mp-button" data-primary="true" href="/auth/login">Go to sign in</a></AuthShell>}
