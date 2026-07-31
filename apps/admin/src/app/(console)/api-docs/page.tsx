"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { LoadingBlock } from "@/components/feedback";
import { apiRequest } from "@/lib/api";

type OpenApiOperation = {
  summary?: string;
  description?: string;
  tags?: string[];
  operationId?: string;
};

type OpenApiDocument = {
  openapi: string;
  info: { title?: string; version?: string };
  paths: Record<string, Record<string, OpenApiOperation | unknown>>;
  components?: { securitySchemes?: Record<string, unknown> };
};

type OperationRow = {
  method: string;
  path: string;
  summary: string;
  tag: string;
  operationId: string;
};

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
]);

function collectOperations(document: OpenApiDocument): OperationRow[] {
  return Object.entries(document.paths)
    .flatMap(([path, pathItem]) =>
      Object.entries(pathItem).flatMap(([method, value]) => {
        if (
          !HTTP_METHODS.has(method.toLowerCase()) ||
          !value ||
          typeof value !== "object"
        )
          return [];
        const operation = value as OpenApiOperation;
        return [
          {
            method: method.toUpperCase(),
            path,
            summary: operation.summary ?? operation.description ?? "No summary",
            tag: operation.tags?.[0] ?? "Other",
            operationId: operation.operationId ?? "",
          },
        ];
      }),
    )
    .sort(
      (left, right) =>
        left.tag.localeCompare(right.tag) ||
        left.path.localeCompare(right.path) ||
        left.method.localeCompare(right.method),
    );
}

const methodClass: Record<string, string> = {
  GET: "text-bg-success",
  POST: "text-bg-primary",
  PUT: "text-bg-warning",
  PATCH: "text-bg-info",
  DELETE: "text-bg-danger",
};

export default function InternalApiDocsPage() {
  const [document, setDocument] = useState<OpenApiDocument | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("ALL");

  useEffect(() => {
    void apiRequest<OpenApiDocument>("/api/v1/docs/openapi.json")
      .then(setDocument)
      .catch((cause) => setError((cause as Error).message));
  }, []);

  const operations = useMemo(
    () => (document ? collectOperations(document) : []),
    [document],
  );
  const tags = useMemo(
    () => Array.from(new Set(operations.map((item) => item.tag))).sort(),
    [operations],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return operations.filter(
      (item) =>
        (tag === "ALL" || item.tag === tag) &&
        (!needle ||
          `${item.method} ${item.path} ${item.summary} ${item.operationId}`
            .toLowerCase()
            .includes(needle)),
    );
  }, [operations, query, tag]);

  async function copySchema() {
    if (!document) return;
    await navigator.clipboard.writeText(JSON.stringify(document, null, 2));
  }

  function downloadSchema() {
    if (!document) return;
    const blob = new Blob([JSON.stringify(document, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `media-platform-openapi-${document.info.version ?? "current"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Internal API documentation"
        subtitle="Administrator-only OpenAPI contract, endpoint inventory and operational reference."
      >
        <button
          className="btn btn-outline-primary"
          onClick={copySchema}
          disabled={!document}
        >
          Copy schema
        </button>
        <button
          className="btn btn-primary"
          onClick={downloadSchema}
          disabled={!document}
        >
          Download OpenAPI
        </button>
      </PageHeader>

      <div className="alert alert-warning">
        This documentation includes internal, billing and administrator
        operations. Do not share the full schema with customer applications.
        Customer developers should use the workspace Developer Integration
        pages.
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {!document ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="row g-3 mb-4">
            <div className="col-sm-6 col-xl-3">
              <div className="card h-100">
                <div className="card-body">
                  <div className="text-secondary small">OpenAPI</div>
                  <strong className="fs-4">{document.openapi}</strong>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-xl-3">
              <div className="card h-100">
                <div className="card-body">
                  <div className="text-secondary small">Version</div>
                  <strong className="fs-4">
                    {document.info.version ?? "Current"}
                  </strong>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-xl-3">
              <div className="card h-100">
                <div className="card-body">
                  <div className="text-secondary small">Paths</div>
                  <strong className="fs-4">
                    {Object.keys(document.paths).length}
                  </strong>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-xl-3">
              <div className="card h-100">
                <div className="card-body">
                  <div className="text-secondary small">Operations</div>
                  <strong className="fs-4">{operations.length}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="row g-2">
                <div className="col-lg-8">
                  <input
                    className="form-control"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search method, path, summary or operation ID"
                  />
                </div>
                <div className="col-lg-4">
                  <select
                    className="form-select"
                    value={tag}
                    onChange={(event) => setTag(event.target.value)}
                  >
                    <option value="ALL">All groups</option>
                    {tags.map((value) => (
                      <option value={value} key={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Endpoint</th>
                    <th>Group</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={`${item.method}-${item.path}`}>
                      <td>
                        <span
                          className={`badge ${methodClass[item.method] ?? "text-bg-secondary"}`}
                        >
                          {item.method}
                        </span>
                      </td>
                      <td>
                        <code>{item.path}</code>
                        {item.operationId && (
                          <div className="text-secondary small">
                            {item.operationId}
                          </div>
                        )}
                      </td>
                      <td>{item.tag}</td>
                      <td>{item.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-footer text-secondary small">
              Showing {filtered.length} of {operations.length} operations.
            </div>
          </div>
        </>
      )}
    </>
  );
}
