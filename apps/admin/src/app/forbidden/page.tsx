import { WORKSPACE_URL } from "@/lib/api";
export default function ForbiddenPage() {
  return (
    <main className="admin-login d-flex align-items-center justify-content-center p-3">
      <div className="card admin-login-card">
        <div className="card-body p-5 text-center">
          <i className="bi bi-shield-lock fs-1 text-danger" />
          <h1 className="h4 mt-3">Administrator access required</h1>
          <p className="text-secondary">
            This account is not listed in PLATFORM_ADMIN_EMAILS.
          </p>
          <div className="d-flex gap-2 justify-content-center">
            <a className="btn btn-primary" href="/login">
              Try another account
            </a>
            <a className="btn btn-outline-secondary" href={WORKSPACE_URL}>
              Workspace app
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
