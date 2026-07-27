"use client";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Feedback } from "@/components/feedback";
import { apiRequest,API_URL,getAccessToken } from "@/lib/api";
const CHUNK=8*1024*1024;
export default function Page(){const [file,setFile]=useState<File|null>(null);const [progress,setProgress]=useState(0);const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
 async function upload(){if(!file)return;setBusy(true);setMessage("");try{
  const init=await apiRequest<{data:{uploadId:string;chunkSizeBytes:number}} >("/api/v1/uploads",{method:"POST",body:JSON.stringify({originalFilename:file.name,contentType:file.type||"application/octet-stream",sizeBytes:file.size})});
  const uploadId=init.data.uploadId;const chunks=Math.ceil(file.size/CHUNK);
  for(let i=0;i<chunks;i++){const body=file.slice(i*CHUNK,Math.min(file.size,(i+1)*CHUNK));const r=await fetch(`${API_URL}/api/v1/uploads/${uploadId}/chunks/${i}`,{method:"PUT",headers:{authorization:`Bearer ${getAccessToken()}`,"content-type":"application/octet-stream"},body});if(!r.ok)throw new Error(`Chunk ${i+1} failed`);setProgress(Math.round(((i+1)/chunks)*90))}
  await apiRequest(`/api/v1/uploads/${uploadId}/complete`,{method:"POST",body:JSON.stringify({})});setProgress(100);setMessage("Upload completed successfully.");
 }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 return <><PageHeader title="Upload media" subtitle="Resumable chunked upload to workspace storage."/>{message&&<Feedback message={message} variant={progress===100?"success":"danger"}/>}<div className="row justify-content-center"><div className="col-xl-8"><div className="card"><div className="card-body p-4 p-lg-5 text-center"><i className="bi bi-cloud-arrow-up display-4 text-primary"/><h2 className="h5 mt-3">Choose a file</h2><p className="text-secondary">The client uploads in 8 MB chunks.</p><input className="form-control" type="file" onChange={e=>{setFile(e.target.files?.[0]??null);setProgress(0)}}/>{file&&<div className="border rounded p-3 mt-3 text-start"><strong>{file.name}</strong><div className="text-secondary small">{(file.size/1024/1024).toFixed(2)} MB · {file.type||"Unknown type"}</div></div>}{(busy||progress>0)&&<div className="progress mt-3" role="progressbar"><div className="progress-bar" style={{width:`${progress}%`}}>{progress}%</div></div>}<button className="btn btn-primary mt-3 px-4" disabled={!file||busy} onClick={upload}>{busy?<><span className="spinner-border spinner-border-sm me-2"/>Uploading…</>:"Start upload"}</button></div></div></div></div></>
}
