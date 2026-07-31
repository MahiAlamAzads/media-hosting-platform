"use client";

import { useState } from "react";

export function DocsCopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      className="btn btn-sm btn-outline-light"
      type="button"
      onClick={copy}
    >
      <i className={`bi ${copied ? "bi-check2" : "bi-copy"} me-1`} />
      {copied ? "Copied" : label}
    </button>
  );
}
