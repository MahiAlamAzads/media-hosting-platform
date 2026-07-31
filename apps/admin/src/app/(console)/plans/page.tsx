"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { EmptyState, Feedback, LoadingBlock } from "@/components/feedback";
import { apiRequest } from "@/lib/api";

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
  versions: Array<{
    id: string;
    version: number;
    publishedAt: string | null;
    retiredAt: string | null;
    _count: { subscriptions: number };
  }>;
};

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<"success" | "danger">("success");

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const response = await apiRequest<{ data: Plan[] }>(
        "/api/v1/admin/plans",
      );
      setPlans(response.data);
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createPlan(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiRequest("/api/v1/admin/plans", {
        method: "POST",
        body: JSON.stringify({
          code: String(data.get("code") ?? "")
            .trim()
            .toUpperCase(),
          name: data.get("name"),
          description: data.get("description") || null,
          isPublic: data.get("isPublic") === "on",
          isActive: true,
          sortOrder: Number(data.get("sortOrder") ?? 100),
        }),
      });
      form.reset();
      setVariant("success");
      setMessage("Plan created. Add a complete version before publishing it.");
      await load();
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Platform plans"
        subtitle="Create plan identities and publish immutable price-and-limit versions."
      >
        <a className="btn btn-outline-secondary" href="/subscriptions">
          Subscriptions
        </a>
        <a className="btn btn-outline-secondary" href="/usage">
          Platform usage
        </a>
      </PageHeader>

      <Feedback
        message={message}
        variant={variant}
        onClose={() => setMessage("")}
      />

      <div className="row g-4">
        <div className="col-xl-8">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <strong>Plan catalogue</strong>
              <span className="text-secondary small">{plans.length} plans</span>
            </div>
            {loading ? (
              <div className="card-body">
                <LoadingBlock label="Loading plans…" />
              </div>
            ) : plans.length === 0 ? (
              <EmptyState
                icon="bi-boxes"
                title="No plans"
                text="Create the first plan identity."
              />
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Status</th>
                      <th>Versions</th>
                      <th>Subscribers</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((plan) => {
                      const published = plan.versions.find(
                        (version) => version.publishedAt && !version.retiredAt,
                      );
                      const subscribers = plan.versions.reduce(
                        (total, version) =>
                          total + version._count.subscriptions,
                        0,
                      );
                      return (
                        <tr key={plan.id}>
                          <td>
                            <strong>{plan.name}</strong>
                            <div className="text-secondary small font-monospace">
                              {plan.code}
                            </div>
                          </td>
                          <td>
                            <span
                              className={`badge ${plan.isActive ? "text-bg-success" : "text-bg-secondary"}`}
                            >
                              {plan.isActive ? "Active" : "Inactive"}
                            </span>
                            {!plan.isPublic && (
                              <span className="badge text-bg-dark ms-1">
                                Private
                              </span>
                            )}
                          </td>
                          <td>{plan.versions.length}</td>
                          <td>{subscribers.toLocaleString()}</td>
                          <td className="text-end">
                            <a
                              className="btn btn-outline-primary btn-sm"
                              href={`/plans/${plan.id}`}
                            >
                              {published
                                ? `Manage v${published.version}`
                                : "Configure"}
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="col-xl-4">
          <div className="card">
            <div className="card-header">
              <strong>Create plan</strong>
            </div>
            <div className="card-body">
              <form onSubmit={createPlan}>
                <div className="mb-3">
                  <label className="form-label" htmlFor="code">
                    Code
                  </label>
                  <input
                    className="form-control font-monospace"
                    id="code"
                    name="code"
                    placeholder="CREATOR"
                    pattern="[A-Za-z0-9_]+"
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="name">
                    Name
                  </label>
                  <input
                    className="form-control"
                    id="name"
                    name="name"
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="description">
                    Description
                  </label>
                  <textarea
                    className="form-control"
                    id="description"
                    name="description"
                    rows={3}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label" htmlFor="sortOrder">
                    Sort order
                  </label>
                  <input
                    className="form-control"
                    id="sortOrder"
                    name="sortOrder"
                    type="number"
                    min={0}
                    defaultValue={100}
                  />
                </div>
                <div className="form-check mb-3">
                  <input
                    className="form-check-input"
                    id="isPublic"
                    name="isPublic"
                    type="checkbox"
                    defaultChecked
                  />
                  <label className="form-check-label" htmlFor="isPublic">
                    Visible on public pricing
                  </label>
                </div>
                <button className="btn btn-primary w-100">Create plan</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
