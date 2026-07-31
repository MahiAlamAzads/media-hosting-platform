"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Feedback, LoadingBlock } from "@/components/feedback";
import { apiRequest } from "@/lib/api";
import {
  formatMetricValue,
  metricLabels,
  type UsageMetricName,
} from "@/lib/billing-format";

type Price = {
  currency: "BDT" | "USD";
  interval: "MONTHLY" | "YEARLY";
  amountMinor: string;
};
type Offer = {
  currency: "BDT" | "USD";
  term: "FREE" | "THREE_MONTHS" | "SIX_MONTHS" | "ONE_YEAR";
  amountMinor: string;
  isPublic: boolean;
  isActive: boolean;
};
type Entitlement = {
  metric: UsageMetricName;
  includedAmount: string;
  hardLimit: boolean;
  overageAllowed: boolean;
  overageUnit: string | null;
  overageBdtMinor: string | null;
  overageUsdMinor: string | null;
};
type Version = {
  id: string;
  version: number;
  effectiveAt: string;
  publishedAt: string | null;
  retiredAt: string | null;
  prices: Price[];
  offers: Offer[];
  entitlements: Entitlement[];
  _count: { subscriptions: number };
};
type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
  versions: Version[];
};

const metrics: UsageMetricName[] = [
  "STORAGE_BYTES",
  "DELIVERY_BYTES",
  "UPLOAD_BYTES",
  "API_REQUESTS",
  "IMAGE_TRANSFORMATIONS",
  "VIDEO_PROCESSING_SECONDS",
  "PROCESSING_CPU_MILLISECONDS",
  "ACTIVE_ASSETS",
  "FOLDERS",
  "WORKSPACE_MEMBERS",
  "API_KEYS",
  "CONCURRENT_JOBS",
  "MAX_FILE_SIZE_BYTES",
];

const defaultAmounts: Record<UsageMetricName, string> = {
  STORAGE_BYTES: "2147483648",
  DELIVERY_BYTES: "5368709120",
  UPLOAD_BYTES: "5368709120",
  API_REQUESTS: "25000",
  IMAGE_TRANSFORMATIONS: "1000",
  VIDEO_PROCESSING_SECONDS: "0",
  PROCESSING_CPU_MILLISECONDS: "0",
  ACTIVE_ASSETS: "1000",
  FOLDERS: "25",
  WORKSPACE_MEMBERS: "1",
  API_KEYS: "1",
  CONCURRENT_JOBS: "1",
  MAX_FILE_SIZE_BYTES: "26214400",
};

function priceKey(currency: string, interval: string): string {
  return `${currency}:${interval}`;
}

function offerKey(currency: string, term: string): string {
  return `${currency}:${term}`;
}

export default function AdminPlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<"success" | "danger">("success");
  const latest = useMemo(() => plan?.versions[0] ?? null, [plan]);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const response = await apiRequest<{ data: Plan[] }>(
        "/api/v1/admin/plans",
      );
      const item = response.data.find((value) => value.id === planId) ?? null;
      if (!item) throw new Error("Plan was not found.");
      setPlan(item);
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [planId]);

  async function updatePlan(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await apiRequest(`/api/v1/admin/plans/${planId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: data.get("name"),
          description: data.get("description") || null,
          isPublic: data.get("isPublic") === "on",
          isActive: data.get("isActive") === "on",
          sortOrder: Number(data.get("sortOrder")),
        }),
      });
      setVariant("success");
      setMessage("Plan identity updated.");
      await load();
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    }
  }

  async function createVersion(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const prices = (["BDT", "USD"] as const).flatMap((currency) =>
      (["MONTHLY", "YEARLY"] as const).map((interval) => ({
        currency,
        interval,
        amountMinor: String(data.get(`price:${currency}:${interval}`) ?? "0"),
      })),
    );
    const entitlements = metrics.map((metric) => ({
      metric,
      includedAmount: String(data.get(`limit:${metric}`) ?? "0"),
      hardLimit: data.get(`hard:${metric}`) === "on",
      overageAllowed: data.get(`overage:${metric}`) === "on",
      overageUnit:
        String(data.get(`overage-unit:${metric}`) ?? "").trim() || null,
      overageBdtMinor:
        String(data.get(`overage-bdt:${metric}`) ?? "").trim() || null,
      overageUsdMinor:
        String(data.get(`overage-usd:${metric}`) ?? "").trim() || null,
    }));

    try {
      await apiRequest(`/api/v1/admin/plans/${planId}/versions`, {
        method: "POST",
        body: JSON.stringify({
          effectiveAt: new Date().toISOString(),
          prices,
          entitlements,
        }),
      });
      setVariant("success");
      setMessage("Draft plan version created. Review it before publishing.");
      await load();
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    }
  }

  async function saveOffers(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!latest || latest.publishedAt) return;

    const data = new FormData(event.currentTarget);
    const terms =
      plan?.code === "FREE"
        ? (["FREE"] as const)
        : (["THREE_MONTHS", "SIX_MONTHS", "ONE_YEAR"] as const);
    const offers = (["BDT", "USD"] as const).flatMap((currency) =>
      terms.map((term) => ({
        currency,
        term,
        amountMinor: String(data.get(`offer:${currency}:${term}`) ?? "0"),
        isPublic: data.get(`offer-public:${currency}:${term}`) === "on",
        isActive: data.get(`offer-active:${currency}:${term}`) === "on",
      })),
    );

    try {
      await apiRequest(
        `/api/v1/admin/plans/${planId}/versions/${latest.id}/offers`,
        {
          method: "PUT",
          body: JSON.stringify({ offers }),
        },
      );
      setVariant("success");
      setMessage("Subscription offers updated for the draft version.");
      await load();
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    }
  }

  async function publish(versionId: string): Promise<void> {
    try {
      await apiRequest(
        `/api/v1/admin/plans/${planId}/versions/${versionId}/publish`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      setVariant("success");
      setMessage(
        "Version published. The previously active version was retired.",
      );
      await load();
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    }
  }

  async function retire(versionId: string): Promise<void> {
    try {
      await apiRequest(
        `/api/v1/admin/plans/${planId}/versions/${versionId}/retire`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      setVariant("success");
      setMessage("Version retired.");
      await load();
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    }
  }

  if (loading) return <LoadingBlock label="Loading plan…" />;
  if (!plan)
    return <Feedback message={message || "Plan not found."} variant="danger" />;

  const latestPrices = new Map<string, string>(
    (latest?.prices ?? []).map((price) => [
      priceKey(price.currency, price.interval),
      price.amountMinor,
    ]),
  );
  const latestLimits = new Map<UsageMetricName, Entitlement>(
    (latest?.entitlements ?? []).map((item) => [item.metric, item]),
  );
  const latestOffers = new Map<string, Offer>(
    (latest?.offers ?? []).map((item) => [
      offerKey(item.currency, item.term),
      item,
    ]),
  );
  const commercialTerms =
    plan.code === "FREE"
      ? (["FREE"] as const)
      : (["THREE_MONTHS", "SIX_MONTHS", "ONE_YEAR"] as const);

  return (
    <>
      <PageHeader
        title={`${plan.name} plan`}
        subtitle={`${plan.code} · versioned BDT and USD pricing with immutable entitlements.`}
      >
        <a className="btn btn-outline-secondary" href="/plans">
          Back to plans
        </a>
      </PageHeader>

      <Feedback
        message={message}
        variant={variant}
        onClose={() => setMessage("")}
      />

      <div className="row g-4 mb-4">
        <div className="col-lg-5">
          <div className="card h-100">
            <div className="card-header">
              <strong>Plan identity</strong>
            </div>
            <div className="card-body">
              <form onSubmit={updatePlan}>
                <div className="mb-3">
                  <label className="form-label" htmlFor="name">
                    Name
                  </label>
                  <input
                    className="form-control"
                    id="name"
                    name="name"
                    defaultValue={plan.name}
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
                    defaultValue={plan.description ?? ""}
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
                    defaultValue={plan.sortOrder}
                  />
                </div>
                <div className="form-check mb-2">
                  <input
                    className="form-check-input"
                    id="isPublic"
                    name="isPublic"
                    type="checkbox"
                    defaultChecked={plan.isPublic}
                  />
                  <label className="form-check-label" htmlFor="isPublic">
                    Public pricing plan
                  </label>
                </div>
                <div className="form-check mb-3">
                  <input
                    className="form-check-input"
                    id="isActive"
                    name="isActive"
                    type="checkbox"
                    defaultChecked={plan.isActive}
                  />
                  <label className="form-check-label" htmlFor="isActive">
                    Active
                  </label>
                </div>
                <button className="btn btn-primary">Save identity</button>
              </form>
            </div>
          </div>
        </div>
        <div className="col-lg-7">
          <div className="card h-100">
            <div className="card-header">
              <strong>Version history</strong>
            </div>
            <div className="table-responsive">
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Subscribers</th>
                    <th>Effective</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {plan.versions.map((version) => (
                    <tr key={version.id}>
                      <td>v{version.version}</td>
                      <td>
                        {version.publishedAt && !version.retiredAt ? (
                          <span className="badge text-bg-success">
                            Published
                          </span>
                        ) : version.retiredAt ? (
                          <span className="badge text-bg-secondary">
                            Retired
                          </span>
                        ) : (
                          <span className="badge text-bg-warning">Draft</span>
                        )}
                      </td>
                      <td>{version._count.subscriptions}</td>
                      <td>
                        {new Date(version.effectiveAt).toLocaleDateString()}
                      </td>
                      <td className="text-end">
                        <div className="btn-group btn-group-sm">
                          {!version.publishedAt && (
                            <button
                              className="btn btn-outline-primary"
                              onClick={() => publish(version.id)}
                            >
                              Publish
                            </button>
                          )}
                          {!version.retiredAt && version.publishedAt && (
                            <button
                              className="btn btn-outline-secondary"
                              onClick={() => retire(version.id)}
                            >
                              Retire
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {latest && !latest.publishedAt && !latest.retiredAt && (
        <div className="card mb-4">
          <div className="card-header">
            <strong>Draft subscription offers</strong>
            <div className="text-secondary small mt-1">
              Configure Free, 3-month, 6-month and 1-year commercial prices
              before publishing. Values use poisha or cents.
            </div>
          </div>
          <div className="card-body">
            <form onSubmit={saveOffers}>
              <div className="table-responsive border rounded">
                <table className="table align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Currency</th>
                      <th>Term</th>
                      <th>Amount minor</th>
                      <th>Public</th>
                      <th>Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["BDT", "USD"] as const).flatMap((currency) =>
                      commercialTerms.map((term) => {
                        const offer = latestOffers.get(
                          offerKey(currency, term),
                        );
                        return (
                          <tr key={`${currency}:${term}`}>
                            <td>
                              <strong>{currency}</strong>
                            </td>
                            <td>{term.replaceAll("_", " ")}</td>
                            <td>
                              <input
                                className="form-control form-control-sm font-monospace"
                                name={`offer:${currency}:${term}`}
                                type="number"
                                min={0}
                                defaultValue={offer?.amountMinor ?? "0"}
                                required
                              />
                            </td>
                            <td>
                              <input
                                className="form-check-input"
                                name={`offer-public:${currency}:${term}`}
                                type="checkbox"
                                defaultChecked={offer?.isPublic ?? true}
                                aria-label={`Public ${currency} ${term} offer`}
                              />
                            </td>
                            <td>
                              <input
                                className="form-check-input"
                                name={`offer-active:${currency}:${term}`}
                                type="checkbox"
                                defaultChecked={offer?.isActive ?? true}
                                aria-label={`Active ${currency} ${term} offer`}
                              />
                            </td>
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>
              <button className="btn btn-primary mt-3">
                Save draft offers
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <strong>Create next version</strong>
          <div className="text-secondary small mt-1">
            Defaults are copied from the latest version. All money fields use
            minor units: poisha or cents.
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={createVersion}>
            <h2 className="h6 mb-3">Prices</h2>
            <div className="row g-3 mb-4">
              {(["BDT", "USD"] as const).flatMap((currency) =>
                (["MONTHLY", "YEARLY"] as const).map((interval) => (
                  <div
                    className="col-sm-6 col-xl-3"
                    key={`${currency}:${interval}`}
                  >
                    <label
                      className="form-label"
                      htmlFor={`price:${currency}:${interval}`}
                    >
                      {currency} {interval.toLowerCase()}
                    </label>
                    <input
                      className="form-control font-monospace"
                      id={`price:${currency}:${interval}`}
                      name={`price:${currency}:${interval}`}
                      type="number"
                      min={0}
                      defaultValue={
                        latestPrices.get(priceKey(currency, interval)) ?? "0"
                      }
                      required
                    />
                  </div>
                )),
              )}
            </div>

            <h2 className="h6 mb-3">Entitlements</h2>
            <div className="table-responsive border rounded">
              <table className="table table-sm mb-0 admin-entitlement-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Included amount</th>
                    <th>Readable value</th>
                    <th>Hard limit</th>
                    <th>Overage</th>
                    <th>Overage unit</th>
                    <th>BDT poisha</th>
                    <th>USD cents</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((metric) => {
                    const previous = latestLimits.get(metric);
                    const amount =
                      previous?.includedAmount ?? defaultAmounts[metric];
                    return (
                      <tr key={metric}>
                        <td>
                          <strong>{metricLabels[metric]}</strong>
                          <div className="small text-secondary font-monospace">
                            {metric}
                          </div>
                        </td>
                        <td>
                          <input
                            className="form-control form-control-sm font-monospace"
                            name={`limit:${metric}`}
                            type="number"
                            min={0}
                            defaultValue={amount}
                            required
                          />
                        </td>
                        <td className="text-secondary">
                          {formatMetricValue(metric, amount)}
                        </td>
                        <td>
                          <input
                            className="form-check-input"
                            name={`hard:${metric}`}
                            type="checkbox"
                            defaultChecked={previous?.hardLimit ?? true}
                            aria-label={`Hard limit for ${metricLabels[metric]}`}
                          />
                        </td>
                        <td>
                          <input
                            className="form-check-input"
                            name={`overage:${metric}`}
                            type="checkbox"
                            defaultChecked={previous?.overageAllowed ?? false}
                            aria-label={`Overage for ${metricLabels[metric]}`}
                          />
                        </td>
                        <td>
                          <input
                            className="form-control form-control-sm font-monospace"
                            name={`overage-unit:${metric}`}
                            type="number"
                            min={0}
                            defaultValue={previous?.overageUnit ?? ""}
                            aria-label={`Overage unit for ${metricLabels[metric]}`}
                          />
                        </td>
                        <td>
                          <input
                            className="form-control form-control-sm font-monospace"
                            name={`overage-bdt:${metric}`}
                            type="number"
                            min={0}
                            defaultValue={previous?.overageBdtMinor ?? ""}
                            aria-label={`BDT overage price for ${metricLabels[metric]}`}
                          />
                        </td>
                        <td>
                          <input
                            className="form-control form-control-sm font-monospace"
                            name={`overage-usd:${metric}`}
                            type="number"
                            min={0}
                            defaultValue={previous?.overageUsdMinor ?? ""}
                            aria-label={`USD overage price for ${metricLabels[metric]}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button className="btn btn-primary mt-4">
              Create draft version
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
