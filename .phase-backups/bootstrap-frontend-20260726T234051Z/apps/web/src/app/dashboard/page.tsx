const metrics = [
  ["Stored assets", "0"],
  ["Storage used", "0 B"],
  ["API requests", "0"],
  ["Active sessions", "0"]
];
export default function Dashboard() {
  return <section className="content">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
      <div><h1 style={{margin:0}}>Overview</h1><p className="muted">Your self-hosted media workspace.</p></div>
      <button className="primary" style={{width:"auto"}} disabled>Upload media — Phase 2</button>
    </div>
    <div className="cards">{metrics.map(([label,value]) =>
      <article className="card" key={label}><span className="muted">{label}</span><div className="metric">{value}</div></article>
    )}</div>
    <article className="card" style={{marginTop:16}}>
      <h2 style={{marginTop:0}}>Platform status</h2>
      <p>Authentication, workspace isolation and local SSD/HDD storage foundation are ready.</p>
    </article>
  </section>;
}
