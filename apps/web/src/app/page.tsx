export default function HomePage() {
  return (
    <main className="min-vh-100 bg-white">
      <nav className="navbar navbar-expand-lg bg-white border-bottom">
        <div className="container py-2">
          <a
            className="navbar-brand d-flex align-items-center gap-2 fw-bold"
            href="#"
          >
            <span className="auth-brand-mark">MP</span>Media Platform
          </a>
          <div className="d-flex gap-2">
            <a className="btn btn-link text-decoration-none" href="/pricing">
              Pricing
            </a>
            <a className="btn btn-outline-primary" href="/auth/login">
              Sign in
            </a>
            <a className="btn btn-primary" href="/auth/register">
              Get started
            </a>
          </div>
        </div>
      </nav>
      <section className="container py-5">
        <div className="row align-items-center g-5 py-lg-5">
          <div className="col-lg-6">
            <span className="badge text-bg-primary mb-3">
              Secure media infrastructure
            </span>
            <h1 className="display-5 fw-bold">
              Store, organize and deliver media from one clean dashboard.
            </h1>
            <p className="lead text-secondary">
              Chunked uploads, private delivery, public assets, API keys, usage
              monitoring and account security.
            </p>
            <div className="d-flex flex-wrap gap-2">
              <a className="btn btn-primary btn-lg" href="/auth/register">
                Create workspace
              </a>
              <a className="btn btn-outline-secondary btn-lg" href="/pricing">
                Compare plans
              </a>
              <a className="btn btn-link btn-lg" href="/auth/login">
                Open dashboard
              </a>
            </div>
          </div>
          <div className="col-lg-6">
            <div className="card shadow-sm">
              <div className="card-body p-4">
                <div className="row g-3">
                  {[
                    "Chunked uploads",
                    "Signed delivery",
                    "Image variants",
                    "Scoped API keys",
                    "Audit logs",
                    "Session security",
                  ].map((x, i) => (
                    <div className="col-6" key={x}>
                      <div className="border rounded p-3 h-100">
                        <i
                          className={`bi ${["bi-cloud-arrow-up", "bi-shield-lock", "bi-images", "bi-key", "bi-clock-history", "bi-person-check"][i]} text-primary fs-4`}
                        />
                        <div className="fw-semibold mt-2">{x}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
