"use client";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { LoadingBlock } from "@/components/feedback";
import { StatCard } from "@/components/stat-card";
import { apiRequest } from "@/lib/api";
import { formatBytes } from "@/lib/billing-format";

type Overview = { counts: Record<string, any>; storage: { usedBytes: string; reservedBytes: string; limitBytes: string }; recentAudit: Array<any>; recentUsers: Array<any> };
export default function DashboardPage(){
 const [data,setData]=useState<Overview|null>(null); const [error,setError]=useState("");
 useEffect(()=>{void apiRequest<{data:Overview}>("/api/v1/admin/console/overview").then(r=>setData(r.data)).catch(e=>setError((e as Error).message))},[]);
 return <><PageHeader title="Platform overview" subtitle="A single operational view across users, workspaces, billing and media processing."><a className="btn btn-outline-secondary" href="/system"><i className="bi bi-heart-pulse me-1"/>System health</a></PageHeader>{error&&<div className="alert alert-danger">{error}</div>}{!data?<LoadingBlock label="Loading platform metrics…"/>:<>
 <div className="row g-3 mb-4">
  <div className="col-sm-6 col-xl-3"><StatCard icon="bi-people" label="Active users" value={String(data.counts.users?.ACTIVE??0)} hint={`+${data.counts.usersThisMonth??0} this month`}/></div>
  <div className="col-sm-6 col-xl-3"><StatCard icon="bi-buildings" label="Active workspaces" value={String(data.counts.workspaces?.ACTIVE??0)} hint={`+${data.counts.workspacesThisMonth??0} this month`}/></div>
  <div className="col-sm-6 col-xl-3"><StatCard icon="bi-database" label="Stored media" value={formatBytes(data.storage.usedBytes)} hint={`${formatBytes(data.storage.reservedBytes)} reserved`}/></div>
  <div className="col-sm-6 col-xl-3"><StatCard icon="bi-cash-coin" label="Payments to review" value={String(data.counts.pendingManualPayments??0)} hint={`${data.counts.overdueInvoices??0} overdue invoices`}/></div>
 </div>
 <div className="row g-4">
  <div className="col-xl-8"><div className="card"><div className="card-header d-flex justify-content-between"><strong>Operational signals</strong><a href="/operations">Open operations</a></div><div className="card-body"><div className="row g-3">
   {[['Active uploads',data.counts.activeUploads,'bi-cloud-arrow-up'],['Failed assets',data.counts.failedAssets,'bi-file-earmark-x'],['Variant queue',data.counts.processingVariants,'bi-images'],['Active sessions',data.counts.activeSessions,'bi-laptop']].map(([label,value,icon])=><div className="col-md-6" key={String(label)}><div className="border rounded p-3 d-flex justify-content-between"><span><i className={`bi ${icon} me-2 text-primary`}/>{label}</span><strong>{String(value)}</strong></div></div>)}
  </div></div></div></div>
  <div className="col-xl-4"><div className="card h-100"><div className="card-header"><strong>Newest users</strong></div><div className="list-group list-group-flush">{data.recentUsers.map(user=><a className="list-group-item list-group-item-action" href={`/users?query=${encodeURIComponent(user.email)}`} key={user.id}><div className="d-flex justify-content-between gap-2"><strong>{user.name}</strong><span className={`badge ${user.status==='ACTIVE'?'text-bg-success':'text-bg-secondary'}`}>{user.status}</span></div><div className="small text-secondary text-truncate">{user.email}</div></a>)}</div></div></div>
  <div className="col-12"><div className="card"><div className="card-header d-flex justify-content-between"><strong>Recent audit activity</strong><a href="/audit">View full trail</a></div><div className="table-responsive"><table className="table mb-0"><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>ID</th></tr></thead><tbody>{data.recentAudit.map(item=><tr key={item.id}><td>{new Date(item.createdAt).toLocaleString()}</td><td><code>{item.action}</code></td><td>{item.entityType}</td><td className="font-monospace small">{item.entityId??'—'}</td></tr>)}</tbody></table></div></div></div>
 </div></>}</>;
}
