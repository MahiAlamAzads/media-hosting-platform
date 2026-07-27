import { API_URL } from "@/lib/api";

const groups = [
  {
    title: "Authentication",
    description: "Create accounts, verify email, sign in, rotate sessions and reset passwords.",
    endpoints: [
      ["POST", "/api/v1/auth/register", "Register user and workspace"],
      ["POST", "/api/v1/auth/verify-email", "Verify email"],
      ["POST", "/api/v1/auth/login", "Receive access token"],
      ["POST", "/api/v1/auth/refresh", "Rotate refresh session"],
      ["POST", "/api/v1/auth/logout", "Revoke current session"],
      ["POST", "/api/v1/auth/forgot-password", "Request reset link"],
      ["POST", "/api/v1/auth/reset-password", "Set a new password"]
    ]
  },
  {
    title: "Uploads",
    description: "Create resumable sessions and upload files in binary chunks.",
    endpoints: [
      ["POST", "/api/v1/uploads", "Create upload"],
      ["GET", "/api/v1/uploads/:uploadId", "Read upload state"],
      ["PUT", "/api/v1/uploads/:uploadId/chunks/:chunkIndex", "Upload binary chunk"],
      ["POST", "/api/v1/uploads/:uploadId/complete", "Assemble and verify"],
      ["DELETE", "/api/v1/uploads/:uploadId", "Abort upload"]
    ]
  },
  {
    title: "Media and delivery",
    description: "List, update, deliver, trash, restore and permanently delete assets.",
    endpoints: [
      ["GET", "/api/v1/media", "List media"],
      ["GET", "/api/v1/media/:assetId", "Read asset details"],
      ["PATCH", "/api/v1/media/:assetId", "Rename, move or change visibility"],
      ["POST", "/api/v1/media/:assetId/delivery-token", "Create signed delivery token"],
      ["POST", "/api/v1/media/:assetId/restore", "Restore from trash"],
      ["DELETE", "/api/v1/media/:assetId/permanent", "Permanent deletion"],
      ["POST", "/api/v1/media/bulk", "Bulk move, trash or restore"]
    ]
  },
  {
    title: "Workspace APIs",
    description: "Manage folders, variants, usage, audit logs, sessions and API keys.",
    endpoints: [
      ["GET", "/api/v1/folders", "List folders"],
      ["POST", "/api/v1/folders", "Create folder"],
      ["PATCH", "/api/v1/folders/:folderId", "Rename or move folder"],
      ["GET", "/api/v1/variants/media/:assetId", "List generated variants"],
      ["GET", "/api/v1/usage/summary", "Usage summary"],
      ["GET", "/api/v1/audit-logs", "Audit log feed"],
      ["GET", "/api/v1/api-keys", "List API keys"],
      ["POST", "/api/v1/api-keys", "Create API key"]
    ]
  }
] as const;

const methodClass: Record<string, string> = {
  GET: "text-bg-success",
  POST: "text-bg-primary",
  PUT: "text-bg-warning",
  PATCH: "text-bg-info",
  DELETE: "text-bg-danger"
};

export default function ApiDocsPage() {
  return (
    <main className="bg-light min-vh-100">
      <nav className="navbar navbar-expand-lg bg-white border-bottom sticky-top">
        <div className="container py-2">
          <a className="navbar-brand d-flex align-items-center gap-2 fw-bold" href="/">
            <span className="auth-brand-mark">MP</span>
            Media Platform API
          </a>
          <div className="d-flex gap-2">
            <a
              className="btn btn-outline-secondary btn-sm"
              href={`${API_URL}/api/v1/docs/openapi.json`}
              target="_blank"
              rel="noreferrer"
            >
              <i className="bi bi-filetype-json me-1" />
              OpenAPI JSON
            </a>
            <a className="btn btn-primary btn-sm" href="/dashboard">
              Dashboard
            </a>
          </div>
        </div>
      </nav>

      <section className="container py-5">
        <div className="row g-4">
          <aside className="col-lg-3">
            <div className="card sticky-lg-top" style={{ top: 88 }}>
              <div className="card-header fw-semibold">Contents</div>
              <div className="list-group list-group-flush">
                <a className="list-group-item list-group-item-action" href="#quickstart">Quick start</a>
                <a className="list-group-item list-group-item-action" href="#authentication">Authentication</a>
                <a className="list-group-item list-group-item-action" href="#scopes">API key scopes</a>
                {groups.map(group => (
                  <a
                    className="list-group-item list-group-item-action"
                    href={`#${group.title.toLowerCase().replaceAll(" ", "-")}`}
                    key={group.title}
                  >
                    {group.title}
                  </a>
                ))}
                <a className="list-group-item list-group-item-action" href="#errors">Errors</a>
              </div>
            </div>
          </aside>

          <div className="col-lg-9">
            <div className="mb-5">
              <span className="badge text-bg-primary mb-3">REST API · OpenAPI 3.1</span>
              <h1 className="display-6 fw-bold">Media Platform API documentation</h1>
              <p className="lead text-secondary">
                Build secure upload, storage, delivery and media-management integrations.
              </p>
            </div>

            <section id="quickstart" className="card mb-4">
              <div className="card-header fw-semibold">Quick start</div>
              <div className="card-body">
                <p>Use a user access token or a scoped API key in the Authorization header.</p>
                <pre className="bg-dark text-light rounded p-3 overflow-auto"><code>{`curl ${API_URL}/api/v1/media \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"`}</code></pre>
                <p className="mb-2">Create an upload session:</p>
                <pre className="bg-dark text-light rounded p-3 overflow-auto mb-0"><code>{`curl -X POST ${API_URL}/api/v1/uploads \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "originalFilename": "example.jpg",
    "contentType": "image/jpeg",
    "sizeBytes": 2457600
  }'`}</code></pre>
              </div>
            </section>

            <section id="authentication" className="card mb-4">
              <div className="card-header fw-semibold">Authentication</div>
              <div className="card-body">
                <p>
                  Access tokens are short-lived. Refresh tokens are stored in an HttpOnly cookie
                  and rotated by <code>POST /api/v1/auth/refresh</code>.
                </p>
                <div className="alert alert-warning mb-0">
                  Never expose API keys in browser source code. Use them only in trusted server-side applications.
                </div>
              </div>
            </section>

            <section id="scopes" className="card mb-4">
              <div className="card-header fw-semibold">API key scopes</div>
              <div className="card-body">
                <div className="row g-2">
                  {[
                    "media:read",
                    "media:write",
                    "media:delete",
                    "folders:read",
                    "folders:write",
                    "uploads:write",
                    "usage:read"
                  ].map(scope => (
                    <div className="col-sm-6 col-xl-4" key={scope}>
                      <div className="border rounded p-2 font-monospace small">{scope}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {groups.map(group => (
              <section
                id={group.title.toLowerCase().replaceAll(" ", "-")}
                className="card mb-4"
                key={group.title}
              >
                <div className="card-header">
                  <strong>{group.title}</strong>
                  <div className="text-secondary small mt-1">{group.description}</div>
                </div>
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr>
                        <th>Method</th>
                        <th>Endpoint</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.endpoints.map(([method, endpoint, description]) => (
                        <tr key={`${method}-${endpoint}`}>
                          <td>
                            <span className={`badge ${methodClass[method]}`}>{method}</span>
                          </td>
                          <td><code>{endpoint}</code></td>
                          <td>{description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}

            <section id="errors" className="card mb-4">
              <div className="card-header fw-semibold">Error responses</div>
              <div className="card-body">
                <pre className="bg-dark text-light rounded p-3 overflow-auto mb-0"><code>{`{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields.",
    "requestId": "request-id",
    "fields": {}
  }
}`}</code></pre>
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
