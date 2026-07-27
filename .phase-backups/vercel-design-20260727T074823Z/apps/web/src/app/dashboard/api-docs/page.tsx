import { PageHeader } from "@/components/page-header";
import { API_URL } from "@/lib/api";

export default function DashboardApiDocsPage() {
  return (
    <>
      <PageHeader
        title="API documentation"
        subtitle="Integration guides, endpoints and machine-readable OpenAPI schema."
      >
        <a className="btn btn-primary" href="/docs" target="_blank">
          <i className="bi bi-box-arrow-up-right me-1" />
          Open full docs
        </a>
      </PageHeader>

      <div className="row g-4">
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-body">
              <i className="bi bi-book fs-2 text-primary" />
              <h2 className="h5 mt-3">Human-readable documentation</h2>
              <p className="text-secondary">
                Quick start, authentication, API-key scopes, upload flow, media APIs and error format.
              </p>
              <a className="btn btn-outline-primary" href="/docs" target="_blank">
                Read documentation
              </a>
            </div>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-body">
              <i className="bi bi-filetype-json fs-2 text-primary" />
              <h2 className="h5 mt-3">OpenAPI 3.1 schema</h2>
              <p className="text-secondary">
                Import the schema into Postman, Insomnia, Bruno or an OpenAPI code generator.
              </p>
              <a
                className="btn btn-outline-primary"
                href={`${API_URL}/api/v1/docs/openapi.json`}
                target="_blank"
                rel="noreferrer"
              >
                Open JSON schema
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
