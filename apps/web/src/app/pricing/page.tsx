"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
import {
  formatMetricValue,
  metricLabels,
  type UsageMetricName,
} from "@/lib/billing-format";
import { Feedback, LoadingBlock } from "@/components/feedback";

type Currency = "BDT" | "USD";
type Term = "FREE" | "THREE_MONTHS" | "SIX_MONTHS" | "ONE_YEAR";
type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  offers: Array<{
    id: string;
    term: Term;
    amountMinor: string;
    formatted: string;
  }>;
  entitlements: Array<{
    metric: UsageMetricName;
    includedAmount: string;
  }>;
};

const terms: Array<{ value: Exclude<Term, "FREE">; label: string }> = [
  { value: "THREE_MONTHS", label: "3 months" },
  { value: "SIX_MONTHS", label: "6 months" },
  { value: "ONE_YEAR", label: "1 year" },
];

const visibleMetrics: UsageMetricName[] = [
  "STORAGE_BYTES",
  "DELIVERY_BYTES",
  "UPLOAD_BYTES",
  "MAX_FILE_SIZE_BYTES",
  "ACTIVE_ASSETS",
  "API_REQUESTS",
];

export default function PricingPage() {
  const [currency, setCurrency] = useState<Currency>("BDT");
  const [term, setTerm] = useState<Exclude<Term, "FREE">>("THREE_MONTHS");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("pricing-currency");
    if (stored === "BDT" || stored === "USD") setCurrency(stored);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`${API_URL}/api/v1/pricing?currency=${currency}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(
            payload?.error?.message ?? "Pricing could not be loaded.",
          );
        }
        setPlans(payload.data.plans);
        localStorage.setItem("pricing-currency", currency);
      })
      .catch((value) => setError(value.message))
      .finally(() => setLoading(false));
  }, [currency]);

  return (
    <main className="min-vh-100 bg-light">
      <nav className="navbar bg-white border-bottom sticky-top">
        <div className="container py-2">
          <a
            className="navbar-brand d-flex align-items-center gap-2 fw-bold"
            href="/"
          >
            <span className="auth-brand-mark">MP</span>
            Media Platform
          </a>
          <div className="d-flex gap-2">
            <a className="btn btn-outline-secondary" href="/auth/login">
              Sign in
            </a>
            <a className="btn btn-primary" href="/auth/register">
              Create workspace
            </a>
          </div>
        </div>
      </nav>

      <section className="container py-5">
        <div className="pricing-heading text-center mx-auto mb-4">
          <h1 className="display-5 fw-bold">Two ways to pay.</h1>
          <p className="lead text-secondary">
            Choose a fixed subscription or top up a prepaid wallet and pay only
            for selected usage. Enterprise terms are custom.
          </p>
        </div>

        <div className="row g-3 mb-5">
          <div className="col-md-4">
            <div className="card h-100">
              <div className="card-body">
                <strong>Subscription</strong>
                <p className="small text-secondary mb-0">
                  Free, 3 months, 6 months or 1 year, paid upfront.
                </p>
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card h-100">
              <div className="card-body">
                <strong>Prepaid PAYG</strong>
                <p className="small text-secondary mb-0">
                  Top up first. Selected metered services debit wallet credit.
                </p>
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card h-100">
              <div className="card-body">
                <strong>Enterprise</strong>
                <p className="small text-secondary mb-0">
                  Custom limits, commercial terms and onboarding.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="d-flex flex-wrap justify-content-center gap-3 mb-5">
          <div className="btn-group">
            {(["BDT", "USD"] as Currency[]).map((value) => (
              <button
                key={value}
                className={`btn ${currency === value ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => setCurrency(value)}
              >
                {value === "BDT" ? "৳ BDT" : "$ USD"}
              </button>
            ))}
          </div>
          <div className="btn-group">
            {terms.map((item) => (
              <button
                key={item.value}
                className={`btn ${term === item.value ? "btn-dark" : "btn-outline-dark"}`}
                onClick={() => setTerm(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <Feedback message={error} variant="danger" />

        {loading ? (
          <div className="d-flex justify-content-center">
            <LoadingBlock label="Loading current prices…" />
          </div>
        ) : (
          <div className="row g-4 align-items-stretch">
            {plans.map((plan) => {
              const selectedTerm: Term = plan.code === "FREE" ? "FREE" : term;
              const offer = plan.offers.find(
                (item) => item.term === selectedTerm,
              );
              return (
                <div className="col-md-6 col-xl-3" key={plan.id}>
                  <article className="card pricing-card h-100">
                    <div className="card-body p-4 d-flex flex-column">
                      <h2 className="h4">{plan.name}</h2>
                      <p className="text-secondary small">{plan.description}</p>
                      <div className="pricing-value mb-1">
                        <span>{offer?.formatted ?? "Unavailable"}</span>
                      </div>
                      <div className="small text-secondary mb-4">
                        {plan.code === "FREE"
                          ? "No commitment"
                          : terms.find((item) => item.value === term)?.label}
                      </div>
                      <ul className="list-unstyled small flex-grow-1">
                        {visibleMetrics.map((metric) => {
                          const item = plan.entitlements.find(
                            (value) => value.metric === metric,
                          );
                          if (!item) return null;
                          return (
                            <li
                              className="d-flex justify-content-between gap-3 py-2 border-bottom"
                              key={metric}
                            >
                              <span className="text-secondary">
                                {metricLabels[metric]}
                              </span>
                              <strong className="text-end">
                                {formatMetricValue(metric, item.includedAmount)}
                              </strong>
                            </li>
                          );
                        })}
                      </ul>
                      <a className="btn btn-primary mt-4" href="/auth/register">
                        {plan.code === "FREE"
                          ? "Start free"
                          : "Create and subscribe"}
                      </a>
                    </div>
                  </article>
                </div>
              );
            })}
            <div className="col-md-6 col-xl-3">
              <article className="card pricing-card h-100 border-dark">
                <div className="card-body p-4 d-flex flex-column">
                  <h2 className="h4">Enterprise</h2>
                  <p className="text-secondary small">
                    Custom scale, support and commercial agreement.
                  </p>
                  <div className="pricing-value mb-4">
                    <span>Custom</span>
                  </div>
                  <ul className="small text-secondary ps-3 flex-grow-1">
                    <li>Custom storage and delivery</li>
                    <li>Migration assistance</li>
                    <li>Custom billing and invoicing</li>
                    <li>Priority support</li>
                  </ul>
                  <a className="btn btn-dark mt-4" href="/auth/register">
                    Talk to sales
                  </a>
                </div>
              </article>
            </div>
          </div>
        )}

        <div className="alert alert-secondary mt-5">
          Manual Payment and SSLCOMMERZ are available for subscription invoices
          and wallet top-ups. Wallet balance is credited only after payment is
          approved or validated.
        </div>
      </section>
    </main>
  );
}
