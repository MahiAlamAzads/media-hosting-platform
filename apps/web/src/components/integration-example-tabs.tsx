"use client";

import { useState } from "react";
import type { IntegrationExample } from "@/lib/integration-examples";

export function IntegrationExampleTabs({
  examples,
}: {
  examples: IntegrationExample[];
}) {
  const [activeId, setActiveId] = useState<IntegrationExample["id"]>(
    examples[0]?.id ?? "nextjs",
  );
  const [copied, setCopied] = useState(false);
  const active =
    examples.find((example) => example.id === activeId) ?? examples[0];

  if (!active) return null;

  async function copyCode(): Promise<void> {
    await navigator.clipboard.writeText(active.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="card integration-example-card">
      <div className="card-header p-0">
        <div
          className="integration-tabs"
          role="tablist"
          aria-label="Integration language"
        >
          {examples.map((example) => (
            <button
              type="button"
              role="tab"
              aria-selected={example.id === active.id}
              className={`integration-tab ${example.id === active.id ? "active" : ""}`}
              key={example.id}
              onClick={() => {
                setActiveId(example.id);
                setCopied(false);
              }}
            >
              {example.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card-body border-bottom">
        <div className="d-flex flex-column flex-lg-row gap-3 justify-content-between">
          <div>
            <h2 className="h5 mb-1">{active.label} integration</h2>
            <p className="text-secondary mb-2">{active.description}</p>
            <code>{active.install}</code>
          </div>
          <div className="d-flex gap-2 align-items-start flex-wrap">
            <button
              className="btn btn-outline-secondary btn-sm"
              type="button"
              onClick={copyCode}
            >
              <i className={`bi ${copied ? "bi-check2" : "bi-copy"} me-1`} />
              {copied ? "Copied" : "Copy"}
            </button>
            <a
              className="btn btn-primary btn-sm"
              href={active.downloadHref}
              download
            >
              <i className="bi bi-download me-1" />
              Download
            </a>
          </div>
        </div>
      </div>

      <div className="integration-code-header">
        <span>{active.filename}</span>
        <span>{active.label}</span>
      </div>
      <pre className="integration-code-block">
        <code>{active.code}</code>
      </pre>
    </div>
  );
}
