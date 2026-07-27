"use client";
import { useEffect,useState } from "react";
import { apiRequest } from "@/lib/api";
import { Empty,Loading,Notice,PageHead } from "@/components/ui";
type Log={id:string;action:string;entityType:string;entityId:string|null;ipAddress:string|null;createdAt:string};
export default function Page(){const[logs,setLogs]=useState<Log[]>([]);const[e,setE]=useState("");const[l,setL]=useState(true);useEffect(()=>{apiRequest<{data:Log[]}>("/api/v1/audit-logs").then(r=>setLogs(r.data)).catch(x=>setE(x.message)).finally(()=>setL(false))},[]);
return <><PageHead title="Every material action remains auditable." description="Workspace lifecycle events are ordered for investigation and operational review."/><Notice message={e} tone="error"/>{l?<Loading/>:logs.length===0?<Empty title="No audit entries" text="Workspace actions will appear here as they occur."/>:<div className="mp-table-wrap"><table className="mp-table"><thead><tr><th>Action</th><th>Entity</th><th>IP address</th><th>Date</th></tr></thead><tbody>{logs.map(x=><tr key={x.id}><td><code>{x.action}</code></td><td>{x.entityType}<div className="mp-row-meta mp-mono">{x.entityId??"—"}</div></td><td className="mp-mono">{x.ipAddress??"—"}</td><td>{new Date(x.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>}</>}
