import { DocsCopyButton } from "@/components/docs-copy-button";
import { IntegrationExampleTabs } from "@/components/integration-example-tabs";
import {
  apiKeyScopes,
  commonErrors,
  coreEndpoints,
  integrationExamples
} from "@/lib/integration-examples";
import { API_URL } from "@/lib/api";
import { PageHeader } from "@/components/page-header";

const CDN_URL =
  process.env.NEXT_PUBLIC_CDN_URL ?? API_URL;

const environmentCode = `MEDIA_PLATFORM_API_URL=${API_URL}
MEDIA_PLATFORM_API_KEY=mh_live_your_key_id.your_secret`;

const publicInitCode = `POST /api/v1/uploads
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "filename": "product.jpg",
  "contentType": "image/jpeg",
  "sizeBytes": 248192,
  "visibility": "PUBLIC"
}`;

const privateInitCode = `POST /api/v1/uploads
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "filename": "invoice.jpg",
  "contentType": "image/jpeg",
  "sizeBytes": 248192,
  "visibility": "PRIVATE"
}`;

const initResponseCode = `{
  "data": {
    "uploadId": "cm_upload_...",
    "assetId": "cm_asset_...",
    "chunkSizeBytes": 8388608,
    "expectedChunks": 1,
    "visibility": "PUBLIC",
    "expiresAt": "2026-07-29T10:00:00.000Z"
  },
  "meta": {
    "requestId": "req_..."
  }
}`;

const completeResponseCode = `{
  "data": {
    "assetId": "cm_asset_...",
    "status": "READY",
    "visibility": "PUBLIC",
    "detectedContentType": "image/jpeg",
    "detectedMediaType": "IMAGE",
    "sizeBytes": "248192",
    "isPublic": true,
    "cdnPath": "/i/cm_asset_...",
    "imgUrl": "${CDN_URL}/i/cm_asset_...",
    "fileUrl": "${CDN_URL}/i/cm_asset_...",
    "thumbnailUrl": null,
    "previewUrl": null
  },
  "meta": {
    "requestId": "req_..."
  }
}`;

const signedUrlCode = `POST /api/v1/media/cm_asset_.../delivery-token
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "disposition": "inline"
}`;

const changeVisibilityCode = `PATCH /api/v1/media/cm_asset_...
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "visibility": "PUBLIC"
}`;

const htmlCode = `<img
  src="${CDN_URL}/i/cm_asset_..."
  alt="Product image"
/>`;

const errorCode = `{
  "error": {
    "code": "PLAN_LIMIT_EXCEEDED",
    "message": "DELIVERY_BYTES exceeds the current plan limit.",
    "metric": "DELIVERY_BYTES",
    "requestId": "req_..."
  }
}`;

const methodClass: Record<string, string> = {
  GET: "text-bg-success",
  POST: "text-bg-primary",
  PUT: "text-bg-warning",
  PATCH: "text-bg-info",
  DELETE: "text-bg-danger"
};

function CodeBlock({
  title,
  code
}: {
  title: string;
  code: string;
}) {
  return (
    <div className="docs-code-shell">
      <div className="docs-code-toolbar">
        <span>{title}</span>
        <DocsCopyButton value={code} />
      </div>
      <pre className="integration-code-block">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function DashboardIntegrationDocsPage() {
  return (
    <>
      <PageHeader
        title="Developer integration guide"
        subtitle="Customer-safe API integration documentation for PUBLIC and PRIVATE media."
      >
        <a className="btn btn-outline-primary" href="/dashboard/api-docs/ai-agent-skills">
          <i className="bi bi-stars me-1" />
          AI agent skills
        </a>
        <a className="btn btn-primary" href="/dashboard/api-keys">
          <i className="bi bi-key me-1" />
          Create API key
        </a>
      </PageHeader>

      <div className="alert alert-info">
        This page documents only customer integration endpoints. Internal platform and administrator APIs are available only inside the Admin Console.
      </div>
      <div className="developer-guide">
        <div className="row g-4">
          <aside className="col-lg-3">
            <div
              className="card sticky-lg-top docs-sidebar"
              style={{ top: 88 }}
            >
              <div className="card-header fw-semibold">
                Start here
              </div>
              <div className="list-group list-group-flush">
                <a
                  className="list-group-item list-group-item-action"
                  href="#choose"
                >
                  Public or private?
                </a>
                <a
                  className="list-group-item list-group-item-action"
                  href="#setup"
                >
                  API key and environment
                </a>
                <a
                  className="list-group-item list-group-item-action"
                  href="#upload-flow"
                >
                  Upload flow
                </a>
                <a
                  className="list-group-item list-group-item-action"
                  href="#private-delivery"
                >
                  Private delivery
                </a>
                <a
                  className="list-group-item list-group-item-action"
                  href="#examples"
                >
                  Framework examples
                </a>
                <a
                  className="list-group-item list-group-item-action"
                  href="#responses"
                >
                  Response fields
                </a>
                <a
                  className="list-group-item list-group-item-action"
                  href="#errors"
                >
                  Errors
                </a>
                <a
                  className="list-group-item list-group-item-action"
                  href="#production"
                >
                  Production checklist
                </a>
              </div>
            </div>
          </aside>

          <div className="col-lg-9">
            <header className="docs-hero mb-4">
              <span className="badge text-bg-primary mb-3">
                5-minute integration guide
              </span>
              <h1 className="display-6 fw-bold">
                Upload an image and receive a ready URL
              </h1>
              <p className="lead text-secondary mb-4">
                Choose PUBLIC for a permanent website CDN URL.
                Choose PRIVATE for a protected file that requires
                a temporary signed URL.
              </p>

              <div className="d-flex flex-wrap gap-2">
                <a
                  className="btn btn-primary"
                  href="#upload-flow"
                >
                  Start uploading
                </a>
                <a
                  className="btn btn-outline-secondary"
                  href="#examples"
                >
                  View framework code
                </a>
              </div>
            </header>

            <section id="choose" className="mb-4">
              <div className="mb-3">
                <h2 className="h4 mb-1">
                  1. Choose public or private
                </h2>
                <p className="text-secondary mb-0">
                  This is the only visibility decision your
                  application must make.
                </p>
              </div>

              <div className="row g-3">
                <div className="col-md-6">
                  <div className="card h-100 docs-choice-card docs-choice-public">
                    <div className="card-body">
                      <div className="d-flex align-items-center gap-2 mb-3">
                        <i className="bi bi-globe2 fs-3 text-success" />
                        <div>
                          <h3 className="h5 mb-0">PUBLIC</h3>
                          <span className="text-secondary small">
                            Permanent CDN URL
                          </span>
                        </div>
                      </div>

                      <p className="text-secondary">
                        Use for product photos, avatars, blog
                        images, public documents and website media.
                      </p>

                      <code className="d-block mb-3">
                        visibility: &quot;PUBLIC&quot;
                      </code>

                      <div className="alert alert-success mb-0">
                        Response includes <code>imgUrl</code> or
                        <code>fileUrl</code>.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="card h-100 docs-choice-card docs-choice-private">
                    <div className="card-body">
                      <div className="d-flex align-items-center gap-2 mb-3">
                        <i className="bi bi-shield-lock fs-3 text-primary" />
                        <div>
                          <h3 className="h5 mb-0">PRIVATE</h3>
                          <span className="text-secondary small">
                            Protected signed delivery
                          </span>
                        </div>
                      </div>

                      <p className="text-secondary">
                        Use for invoices, user documents, internal
                        media and files requiring authorization.
                      </p>

                      <code className="d-block mb-3">
                        visibility: &quot;PRIVATE&quot;
                      </code>

                      <div className="alert alert-primary mb-0">
                        Response has <code>imgUrl: null</code>.
                        Create a temporary signed URL when needed.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section id="setup" className="card mb-4">
              <div className="card-header fw-semibold">
                2. Create an API key
              </div>
              <div className="card-body">
                <ol className="docs-steps mb-4">
                  <li>
                    Open <code>/dashboard/api-keys</code>.
                  </li>
                  <li>
                    Create a key with
                    <code className="mx-1">uploads:write</code>
                    and
                    <code className="ms-1">media:read</code>.
                  </li>
                  <li>
                    Add
                    <code className="mx-1">media:write</code>
                    only when your application changes visibility,
                    filename or folder later.
                  </li>
                  <li>
                    Save the key in server environment variables.
                  </li>
                </ol>

                <div className="alert alert-warning">
                  <strong>Never expose an API key.</strong>
                  Do not use it in browser JavaScript,
                  <code className="mx-1">NEXT_PUBLIC_</code>
                  variables, mobile bundles or public repositories.
                </div>

                <CodeBlock
                  title=".env"
                  code={environmentCode}
                />

                <div className="row g-3 mt-1">
                  {apiKeyScopes.map(([scope, description]) => (
                    <div className="col-md-6" key={scope}>
                      <div className="border rounded p-3 h-100">
                        <code className="d-block mb-2">
                          {scope}
                        </code>
                        <span className="text-secondary small">
                          {description}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section id="upload-flow" className="card mb-4">
              <div className="card-header fw-semibold">
                3. Upload flow
              </div>
              <div className="card-body">
                <div className="alert alert-info">
                  Most developers should use one of the complete
                  framework examples below. Build the raw flow only
                  when creating your own SDK.
                </div>

                <div className="docs-flow mb-4">
                  <div>
                    <span>1</span>
                    <strong>Create upload</strong>
                  </div>
                  <i className="bi bi-arrow-right" />
                  <div>
                    <span>2</span>
                    <strong>Send chunks</strong>
                  </div>
                  <i className="bi bi-arrow-right" />
                  <div>
                    <span>3</span>
                    <strong>Complete</strong>
                  </div>
                  <i className="bi bi-arrow-right" />
                  <div>
                    <span>4</span>
                    <strong>Save URL</strong>
                  </div>
                </div>

                <h3 className="h6">
                  Step 1 — Start a public upload
                </h3>
                <CodeBlock
                  title="HTTP request"
                  code={publicInitCode}
                />

                <details className="docs-details my-3">
                  <summary>
                    Upload a private image instead
                  </summary>
                  <div className="pt-3">
                    <CodeBlock
                      title="HTTP request"
                      code={privateInitCode}
                    />
                  </div>
                </details>

                <h3 className="h6 mt-4">
                  Step 2 — Read the upload instructions
                </h3>
                <CodeBlock
                  title="201 response"
                  code={initResponseCode}
                />

                <p className="text-secondary mt-3">
                  Split the file using the returned
                  <code className="mx-1">chunkSizeBytes</code>.
                  Send each part in order:
                </p>

                <pre className="docs-inline-request">
                  <code>
                    PUT /api/v1/uploads/:uploadId/chunks/:chunkIndex
                    {"\n"}Content-Type: application/octet-stream
                    {"\n"}Body: raw binary chunk
                  </code>
                </pre>

                <h3 className="h6 mt-4">
                  Step 3 — Complete the upload
                </h3>

                <pre className="docs-inline-request">
                  <code>
                    POST /api/v1/uploads/:uploadId/complete
                    {"\n"}Authorization: Bearer YOUR_API_KEY
                    {"\n"}Content-Type: application/json
                    {"\n\n"}{"{}"}
                  </code>
                </pre>

                <h3 className="h6 mt-4">
                  Step 4 — Save the response
                </h3>
                <CodeBlock
                  title="200 response"
                  code={completeResponseCode}
                />

                <div className="alert alert-success mt-3">
                  Store <code>assetId</code> as the permanent
                  identifier. For PUBLIC images, store or use
                  <code className="ms-1">imgUrl</code> directly.
                </div>

                <CodeBlock
                  title="HTML"
                  code={htmlCode}
                />
              </div>
            </section>

            <section id="private-delivery" className="card mb-4">
              <div className="card-header fw-semibold">
                4. Deliver private media
              </div>
              <div className="card-body">
                <p>
                  Private uploads return
                  <code className="mx-1">imgUrl: null</code>.
                  Create a signed URL from your trusted server only
                  when an authorized user requests the file.
                </p>

                <CodeBlock
                  title="Create signed URL"
                  code={signedUrlCode}
                />

                <p className="text-secondary small mt-3">
                  The response contains
                  <code className="mx-1">data.path</code>.
                  Prefix it with your API URL. Signed URLs expire,
                  so do not save them permanently in your database.
                </p>

                <hr />

                <h3 className="h6">
                  Change visibility later
                </h3>
                <CodeBlock
                  title="Make an asset public"
                  code={changeVisibilityCode}
                />
                <p className="text-secondary small mb-0 mt-3">
                  Use <code>PRIVATE</code> in the same request to
                  disable public delivery. Requires
                  <code className="ms-1">media:write</code>.
                </p>
              </div>
            </section>

            <section id="examples" className="mb-4">
              <div className="mb-3">
                <h2 className="h4 mb-1">
                  5. Copy a complete framework example
                </h2>
                <p className="text-secondary mb-0">
                  Every example supports PUBLIC and PRIVATE uploads,
                  uses the server-provided chunk size and aborts
                  failed upload sessions.
                </p>
              </div>

              <IntegrationExampleTabs
                examples={integrationExamples}
              />

              <div className="d-flex flex-wrap gap-2 mt-3">
                <a
                  className="btn btn-outline-secondary btn-sm"
                  href="/examples/media-platform-client.ts"
                  download
                >
                  TypeScript client
                </a>
                <a
                  className="btn btn-outline-secondary btn-sm"
                  href="/examples/media-platform-client.mjs"
                  download
                >
                  Node.js client
                </a>
                <a
                  className="btn btn-outline-secondary btn-sm"
                  href="/examples/MediaPlatformClient.php"
                  download
                >
                  PHP client
                </a>
                <a
                  className="btn btn-outline-secondary btn-sm"
                  href="/examples/README.md"
                  download
                >
                  Example README
                </a>
              </div>
            </section>

            <section id="responses" className="card mb-4">
              <div className="card-header fw-semibold">
                6. Understand the response
              </div>
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Meaning</th>
                      <th>Save it?</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><code>assetId</code></td>
                      <td>Permanent media identifier.</td>
                      <td>Yes</td>
                    </tr>
                    <tr>
                      <td><code>visibility</code></td>
                      <td>PUBLIC or PRIVATE.</td>
                      <td>Optional</td>
                    </tr>
                    <tr>
                      <td><code>imgUrl</code></td>
                      <td>
                        Permanent public image URL. Null for
                        private media and non-image files.
                      </td>
                      <td>Public images</td>
                    </tr>
                    <tr>
                      <td><code>fileUrl</code></td>
                      <td>
                        Permanent public URL for any public file.
                      </td>
                      <td>Public files</td>
                    </tr>
                    <tr>
                      <td><code>thumbnailUrl</code></td>
                      <td>
                        Public thumbnail URL after the variant is
                        ready.
                      </td>
                      <td>Optional</td>
                    </tr>
                    <tr>
                      <td><code>previewUrl</code></td>
                      <td>
                        Public preview URL after the variant is
                        ready.
                      </td>
                      <td>Optional</td>
                    </tr>
                    <tr>
                      <td><code>requestId</code></td>
                      <td>
                        Support and audit correlation identifier.
                      </td>
                      <td>Log it</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card mb-4">
              <div className="card-header fw-semibold">
                7. Core endpoints
              </div>
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Method</th>
                      <th>Endpoint</th>
                      <th>Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coreEndpoints.map(
                      ([method, endpoint, purpose]) => (
                        <tr key={`${method}-${endpoint}`}>
                          <td>
                            <span
                              className={`badge ${methodClass[method]}`}
                            >
                              {method}
                            </span>
                          </td>
                          <td><code>{endpoint}</code></td>
                          <td>{purpose}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="errors" className="card mb-4">
              <div className="card-header fw-semibold">
                8. Handle errors
              </div>
              <div className="card-body border-bottom">
                <p className="mb-3">
                  All errors use a predictable JSON envelope.
                  Log the returned <code>requestId</code>.
                </p>
                <CodeBlock
                  title="Error response"
                  code={errorCode}
                />
              </div>

              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>HTTP</th>
                      <th>Typical code</th>
                      <th>What to do</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commonErrors.map(
                      ([status, code, action]) => (
                        <tr key={`${status}-${code}`}>
                          <td>{status}</td>
                          <td><code>{code}</code></td>
                          <td>{action}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="production" className="card">
              <div className="card-header fw-semibold">
                9. Production checklist
              </div>
              <div className="card-body">
                <ul className="integration-checklist mb-0">
                  <li>
                    Keep every API key on a trusted server.
                  </li>
                  <li>
                    Give each application a separate key with only
                    the scopes it needs.
                  </li>
                  <li>
                    Explicitly send
                    <code className="mx-1">visibility</code>
                    instead of depending on the default.
                  </li>
                  <li>
                    Use the returned
                    <code className="mx-1">chunkSizeBytes</code>.
                    Do not hardcode an upload chunk size.
                  </li>
                  <li>
                    Abort failed uploads so storage reservations
                    are released quickly.
                  </li>
                  <li>
                    Store <code>assetId</code>. Use
                    <code className="mx-1">imgUrl</code>
                    only for public images.
                  </li>
                  <li>
                    Generate private signed URLs just before
                    delivery and never store them permanently.
                  </li>
                  <li>
                    Retry only safe operations with exponential
                    backoff, especially after HTTP 429.
                  </li>
                  <li>
                    Log <code>requestId</code> from success and
                    error responses.
                  </li>
                </ul>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
