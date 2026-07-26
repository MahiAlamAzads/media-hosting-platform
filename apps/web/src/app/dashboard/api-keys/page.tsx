"use client";
import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
type Key={id:string;name:string;prefix:string;scopes:string[];createdAt:string;lastUsedAt:string|null;revokedAt:string|null};
export default function ApiKeysPage(){
 const [keys,setKeys]=useState<Key[]>([]);const [secret,setSecret]=useState("");const [message,setMessage]=useState("");
 const load=()=>apiRequest<{data:Key[]}>("/api/v1/api-keys").then(r=>setKeys(r.data)).catch(e=>setMessage(e.message));
 useEffect(()=>{load()},[]);
 async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);
  const scopes=f.getAll("scopes");const r=await apiRequest<{data:{rawKey:string}}>("/api/v1/api-keys",{method:"POST",body:JSON.stringify({name:f.get("name"),scopes})});
  setSecret(r.data.rawKey);e.currentTarget.reset();load();
 }
 async function revoke(id:string){await apiRequest(`/api/v1/api-keys/${id}`,{method:"DELETE"});load();}
 return <section className="content"><div className="page-heading"><div><h1>API keys</h1><p className="muted">Scoped server-to-server credentials.</p></div></div>
 {secret&&<div className="secret-box"><strong>Copy this key now. It will not be shown again.</strong><code>{secret}</code></div>}
 {message&&<div className="notice error">{message}</div>}
 <div className="settings-grid"><form className="card" onSubmit={create}><h2>Create key</h2>
  <label className="field">Name<input name="name" required /></label>
  <div className="scope-grid">{["media:read","media:write","media:delete","folders:read","folders:write","uploads:write","usage:read"].map(s=><label key={s}><input type="checkbox" name="scopes" value={s}/>{s}</label>)}</div>
  <button className="secondary">Create key</button></form>
  <div className="card"><h2>Existing keys</h2><div className="data-list">{keys.map(k=><div className="data-row" key={k.id}><div><strong>{k.name}</strong><div className="muted">{k.prefix} · {k.scopes.join(", ")}</div></div>{!k.revokedAt&&<button className="danger-button" onClick={()=>revoke(k.id)}>Revoke</button>}</div>)}</div></div>
 </div></section>;
}
