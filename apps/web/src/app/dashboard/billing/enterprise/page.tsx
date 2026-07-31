"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Feedback, LoadingBlock } from "@/components/feedback";
import { apiRequest } from "@/lib/api";

type Existing = null | {
  id: string;
  status: string;
  companyName: string;
  contactName: string;
  email: string;
  createdAt: string;
};

export default function EnterprisePage() {
  const [existing, setExisting] = useState<Existing>(null);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    teamSize: "",
    expectedStorageGb: "",
    expectedDeliveryGb: "",
    expectedMonthlyRequests: "",
    message: "",
  });
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<"success" | "danger">("success");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void apiRequest<{ data: { enterpriseInquiry: Existing } }>(
      "/api/v1/billing/revenue-options",
    )
      .then((response) => {
        setExisting(response.data.enterpriseInquiry);
        setLoaded(true);
      })
      .catch((error) => {
        setVariant("danger");
        setMessage(error.message);
        setLoaded(true);
      });
  }, []);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await apiRequest<{ data: Existing }>(
        "/api/v1/billing/enterprise-inquiries",
        {
          method: "POST",
          body: JSON.stringify({
            companyName: form.companyName,
            contactName: form.contactName,
            email: form.email,
            phone: form.phone || null,
            teamSize: form.teamSize ? Number(form.teamSize) : null,
            expectedStorageBytes: form.expectedStorageGb
              ? String(Math.round(Number(form.expectedStorageGb) * 1024 ** 3))
              : null,
            expectedDeliveryBytes: form.expectedDeliveryGb
              ? String(Math.round(Number(form.expectedDeliveryGb) * 1024 ** 3))
              : null,
            expectedMonthlyRequests: form.expectedMonthlyRequests || null,
            message: form.message || null,
          }),
        },
      );
      setExisting(response.data);
      setVariant("success");
      setMessage(
        "Enterprise request submitted. Our sales team will contact you.",
      );
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Enterprise"
        subtitle="Request custom capacity, pricing, onboarding and service commitments."
      >
        <a
          className="btn btn-outline-secondary"
          href="/dashboard/billing/revenue-model"
        >
          Revenue options
        </a>
      </PageHeader>
      <Feedback message={message} variant={variant} />

      {!loaded ? (
        <LoadingBlock />
      ) : existing ? (
        <div className="card">
          <div className="card-body p-4">
            <span className="badge text-bg-info mb-3">
              {existing.status.replaceAll("_", " ")}
            </span>
            <h2 className="h4">{existing.companyName}</h2>
            <p className="text-secondary">
              Request submitted by {existing.contactName} on{" "}
              {new Date(existing.createdAt).toLocaleDateString()}.
            </p>
            <p className="mb-0">
              A platform administrator can update this request from the separate
              admin console.
            </p>
          </div>
        </div>
      ) : (
        <form className="card" onSubmit={submit}>
          <div className="card-body p-4">
            <div className="row g-3">
              {[
                ["Company name", "companyName", "text"],
                ["Contact name", "contactName", "text"],
                ["Work email", "email", "email"],
                ["Phone", "phone", "text"],
                ["Team size", "teamSize", "number"],
                ["Expected storage (GB)", "expectedStorageGb", "number"],
                [
                  "Expected monthly delivery (GB)",
                  "expectedDeliveryGb",
                  "number",
                ],
                [
                  "Expected monthly API requests",
                  "expectedMonthlyRequests",
                  "number",
                ],
              ].map(([label, key, type]) => (
                <div className="col-md-6" key={key}>
                  <label className="form-label">{label}</label>
                  <input
                    className="form-control"
                    type={type}
                    required={["companyName", "contactName", "email"].includes(
                      key,
                    )}
                    value={form[key as keyof typeof form]}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                  />
                </div>
              ))}
              <div className="col-12">
                <label className="form-label">Requirements</label>
                <textarea
                  className="form-control"
                  rows={5}
                  value={form.message}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      message: event.target.value,
                    }))
                  }
                  placeholder="Migration, compliance, uptime, support, custom domain or capacity requirements"
                />
              </div>
            </div>
          </div>
          <div className="card-footer text-end">
            <button className="btn btn-dark" disabled={busy}>
              {busy ? "Submitting…" : "Submit Enterprise request"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
