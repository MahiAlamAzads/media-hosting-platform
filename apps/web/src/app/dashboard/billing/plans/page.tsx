"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Feedback, LoadingBlock } from "@/components/feedback";
import { apiRequest } from "@/lib/api";
import {
  formatMetricValue,
  metricLabels,
  type UsageMetricName
} from "@/lib/billing-format";

type Currency = "BDT" | "USD";
type Term = "FREE" | "THREE_MONTHS" | "SIX_MONTHS" | "ONE_YEAR";
type Offer = {
  id: string;
  term: Term;
  amountMinor: string;
  formatted: string;
};
type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  versionId: string;
  offers: Offer[];
  entitlements: Array<{
    metric: UsageMetricName;
    includedAmount: string;
  }>;
};
type Subscription = {
  currency: Currency;
  revenueModel: string;
  subscriptionTerm: Term | "ENTERPRISE_CUSTOM";
  commitmentEndsAt: string | null;
  plan: { code: string; name: string };
  pendingChange: null | {
    id: string;
    status: string;
    planName: string;
    currency: Currency;
    subscriptionTerm: string;
    invoice: null | { id: string; number: string; status: string };
  };
};

const highlights: UsageMetricName[] = [
  "STORAGE_BYTES",
  "DELIVERY_BYTES",
  "UPLOAD_BYTES",
  "MAX_FILE_SIZE_BYTES",
  "ACTIVE_ASSETS",
  "API_KEYS"
];

const terms: Array<{ value: Exclude<Term, "FREE">; label: string; hint: string }> = [
  { value: "THREE_MONTHS", label: "3 months", hint: "Short commitment" },
  { value: "SIX_MONTHS", label: "6 months", hint: "Balanced term" },
  { value: "ONE_YEAR", label: "1 year", hint: "Best annual value" }
];

export default function BillingPlansPage() {
  const [currency, setCurrency] = useState<Currency>("BDT");
  const [term, setTerm] = useState<Exclude<Term, "FREE">>("THREE_MONTHS");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState("");
  const [message, setMessage] = useState("");
  const [variant, setVariant] =
    useState<"success" | "danger" | "warning">("success");

  async function load(nextCurrency?: Currency): Promise<void> {
    setLoading(true);
    try {
      const subscriptionResponse =
        await apiRequest<{ data: Subscription }>(
          "/api/v1/billing/subscription"
        );
      const selectedCurrency =
        nextCurrency ?? subscriptionResponse.data.currency;
      const plansResponse =
        await apiRequest<{ data: { plans: Plan[] } }>(
          `/api/v1/billing/plans?currency=${selectedCurrency}`
        );
      setSubscription(subscriptionResponse.data);
      setPlans(plansResponse.data.plans);
      setCurrency(selectedCurrency);
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

  async function selectPlan(plan: Plan): Promise<void> {
    const selectedTerm: Term =
      plan.code === "FREE" ? "FREE" : term;
    setBusyPlan(plan.code);
    setMessage("");
    try {
      const response = await apiRequest<{
        data: {
          paymentRequired: boolean;
          invoice: null | { id: string };
        };
      }>("/api/v1/billing/subscription-offers/select", {
        method: "POST",
        body: JSON.stringify({
          planCode: plan.code,
          currency,
          term: selectedTerm
        })
      });

      if (response.data.paymentRequired && response.data.invoice) {
        window.location.assign(
          `/dashboard/billing/payments/${response.data.invoice.id}`
        );
        return;
      }

      await load(currency);
      setVariant("success");
      setMessage("Subscription selection applied.");
    } catch (error) {
      setVariant("danger");
      setMessage((error as Error).message);
    } finally {
      setBusyPlan("");
    }
  }

  return (
    <>
      <PageHeader
        title="Subscription plans"
        subtitle="Choose Free, 3 months, 6 months or 1 year. Paid terms are invoiced upfront."
      >
        <a className="btn btn-outline-secondary" href="/dashboard/billing/revenue-model">
          Revenue options
        </a>
        <a className="btn btn-outline-success" href="/dashboard/billing/pay-as-you-go">
          Prepaid PAYG
        </a>
      </PageHeader>

      <Feedback message={message} variant={variant} />

      {subscription?.pendingChange && (
        <div className="alert alert-warning d-flex flex-wrap justify-content-between gap-3">
          <span>
            Pending: <strong>{subscription.pendingChange.planName}</strong>{" "}
            · {subscription.pendingChange.subscriptionTerm.replaceAll("_", " ")}
          </span>
          {subscription.pendingChange.invoice && (
            <a
              className="btn btn-warning btn-sm"
              href={`/dashboard/billing/payments/${subscription.pendingChange.invoice.id}`}
            >
              Complete payment
            </a>
          )}
        </div>
      )}

      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div className="btn-group">
          {(["BDT", "USD"] as Currency[]).map(value => (
            <button
              key={value}
              className={`btn ${currency === value ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => {
                setCurrency(value);
                void load(value);
              }}
            >
              {value === "BDT" ? "৳ BDT" : "$ USD"}
            </button>
          ))}
        </div>

        <div className="btn-group">
          {terms.map(item => (
            <button
              key={item.value}
              className={`btn ${term === item.value ? "btn-dark" : "btn-outline-dark"}`}
              title={item.hint}
              onClick={() => setTerm(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <LoadingBlock label="Loading subscription offers…" /> : (
        <div className="row g-4">
          {plans.map(plan => {
            const selectedTerm: Term =
              plan.code === "FREE" ? "FREE" : term;
            const offer = plan.offers.find(item => item.term === selectedTerm);
            const current =
              subscription?.revenueModel === "SUBSCRIPTION" &&
              subscription.plan.code === plan.code &&
              subscription.subscriptionTerm === selectedTerm &&
              subscription.currency === currency;

            return (
              <div className="col-md-6 col-xl-3" key={plan.id}>
                <article className={`card h-100 pricing-card ${current ? "border-primary" : ""}`}>
                  <div className="card-body p-4 d-flex flex-column">
                    <div className="d-flex justify-content-between gap-2 mb-2">
                      <h2 className="h4 mb-0">{plan.name}</h2>
                      {current && <span className="badge text-bg-primary">Current</span>}
                    </div>
                    <p className="small text-secondary">{plan.description}</p>

                    <div className="pricing-value mb-2">
                      <span>{offer?.formatted ?? "Unavailable"}</span>
                    </div>
                    <div className="small text-secondary mb-4">
                      {plan.code === "FREE"
                        ? "No commitment"
                        : terms.find(item => item.value === term)?.label}
                    </div>

                    <ul className="list-unstyled small flex-grow-1">
                      {highlights.map(metric => {
                        const entitlement = plan.entitlements.find(
                          item => item.metric === metric
                        );
                        if (!entitlement) return null;
                        return (
                          <li className="d-flex justify-content-between gap-3 py-2 border-bottom" key={metric}>
                            <span className="text-secondary">{metricLabels[metric]}</span>
                            <strong className="text-end">
                              {formatMetricValue(metric, entitlement.includedAmount)}
                            </strong>
                          </li>
                        );
                      })}
                    </ul>

                    <button
                      className={`btn mt-4 ${current ? "btn-outline-secondary" : "btn-primary"}`}
                      disabled={current || !offer || busyPlan === plan.code}
                      onClick={() => selectPlan(plan)}
                    >
                      {current
                        ? "Current subscription"
                        : busyPlan === plan.code
                          ? "Preparing invoice…"
                          : plan.code === "FREE"
                            ? "Use Free"
                            : "Select and pay"}
                    </button>
                  </div>
                </article>
              </div>
            );
          })}

          <div className="col-md-6 col-xl-3">
            <article className="card h-100 pricing-card border-dark">
              <div className="card-body p-4 d-flex flex-column">
                <h2 className="h4">Enterprise</h2>
                <p className="text-secondary small">
                  Custom capacity, pricing, migration, support and contract terms.
                </p>
                <div className="display-6 fw-semibold mb-4">Let&apos;s talk</div>
                <ul className="small text-secondary ps-3 flex-grow-1">
                  <li>Custom storage and bandwidth</li>
                  <li>Negotiated commercial terms</li>
                  <li>Onboarding and migration support</li>
                  <li>Priority support and service commitments</li>
                </ul>
                <a className="btn btn-dark mt-4" href="/dashboard/billing/enterprise">
                  Talk to sales
                </a>
              </div>
            </article>
          </div>
        </div>
      )}
    </>
  );
}
