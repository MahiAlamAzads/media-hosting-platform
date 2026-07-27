export default function HomePage() {
  return <main className="vbg-report">
    <div className="vbg-shell">
      <a className="vbg-skip-link" href="#main">Skip to content</a>
      <header className="vbg-header">
        <div className="vbg-masthead">
          <a className="vbg-identity" href="/">
            <span className="mp-triangle" aria-hidden="true" />
            <span>Media Platform</span>
          </a>
          <div className="vbg-document-meta">
            <a href="/auth/login">Sign in</a>
            <a href="/auth/register">Create workspace</a>
          </div>
        </div>
      </header>
      <main id="main">
        <section className="vbg-opening">
          <div className="vbg-opening-claim">
            <h1 className="vbg-display">One workspace for the entire media lifecycle.</h1>
          </div>
          <div className="vbg-opening-proof">
            <p className="vbg-lede">
              Resumable uploads, local storage, signed delivery, image variants,
              scoped API keys and database-backed session security.
            </p>
            <div className="vbg-cluster">
              <a className="vbg-button" href="/auth/register">Create workspace</a>
              <a className="vbg-button" href="/docs">Read API documentation</a>
            </div>
          </div>
        </section>
        <section className="vbg-section">
          <div className="vbg-stat-strip">
            <div className="vbg-stat"><div className="vbg-stat-label">Upload</div><div className="vbg-stat-value">8 MB</div><div className="vbg-stat-detail">Resumable chunks</div></div>
            <div className="vbg-stat"><div className="vbg-stat-label">Integrity</div><div className="vbg-stat-value">SHA-256</div><div className="vbg-stat-detail">Streaming verification</div></div>
            <div className="vbg-stat"><div className="vbg-stat-label">Delivery</div><div className="vbg-stat-value">Range</div><div className="vbg-stat-detail">Seekable media</div></div>
          </div>
        </section>
        <section className="vbg-section vbg-split">
          <div className="vbg-span-5"><h2 className="vbg-heading-24">A complete operational surface</h2></div>
          <div className="vbg-span-7 vbg-flow">
            <p>Organize assets in nested folders, expose selected files publicly, generate image previews and inspect every workspace action through audit logs.</p>
            <p>Use browser sessions for people and scoped API keys for trusted server applications.</p>
          </div>
        </section>
      </main>
      <footer className="vbg-footer">
        <span className="mp-triangle" aria-hidden="true" />
        <span>Media Platform</span>
      </footer>
    </div>
  </main>;
}
