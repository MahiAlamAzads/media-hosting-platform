"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Feedback, LoadingBlock } from "@/components/feedback";
import { apiRequest } from "@/lib/api";
import { formatMoneyMinor } from "@/lib/billing-format";

type RevenueOptions = {
  current: {
    revenueModel: "SUBSCRIPTION" | "PREPAID_PAYG" | "ENTERPRISE_CUSTOM";
    subscriptionTerm: string;
    currency: "BDT" | "USD";
    planName: string;
    commitmentEndsAt: string | null;
  };
  minimumTopupMinor: string;
  wallet: null | {
    availableMinor: string;
    status: string;
  };
  enterpriseInquiry: null | {
    status: string;
    companyName: string;
  };
};

export default function RevenueModelPage() {
  const [data, setData] = useState<RevenueOptions | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiRequest<{ data: RevenueOptions }>("/api/v1/billing/revenue-options")
      .then((response) => setData(response.data))
      .catch((value) => setError(value.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Choose how you pay"
        subtitle="Use a fixed-term subscription, prepaid usage credit, or request a custom Enterprise agreement."
      />
      <Feedback message={error} variant="danger" />

      {!data ? (
        <LoadingBlock label="Loading revenue options…" />
      ) : (
        <>
          <div className="alert alert-secondary">
            Current model:{" "}
            <strong>{data.current.revenueModel.replaceAll("_", " ")}</strong>
            {" · "}
            {data.current.planName}
            {" · "}
            {data.current.subscriptionTerm.replaceAll("_", " ")}
          </div>

          <div className="row g-4">
            <div className="col-lg-4">
              <article
                className={`card h-100 ${
                  data.current.revenueModel === "SUBSCRIPTION"
                    ? "border-primary"
                    : ""
                }`}
              >
                <div className="card-body p-4 d-flex flex-column">
                  <i className="bi bi-calendar-check fs-2 text-primary mb-3" />
                  <h2 className="h4">Subscription</h2>
                  <p className="text-secondary">
                    Predictable limits and fixed upfront pricing. Choose Free, 3
                    months, 6 months or 1 year.
                  </p>
                  <ul className="small text-secondary ps-3">
                    <li>Included storage and bandwidth</li>
                    <li>Fixed commitment period</li>
                    <li>Manual Payment or SSLCOMMERZ</li>
                  </ul>
                  <a
                    className="btn btn-primary mt-auto"
                    href="/dashboard/billing/plans"
                  >
                    Compare subscription offers
                  </a>
                </div>
              </article>
            </div>

            <div className="col-lg-4">
              <article
                className={`card h-100 ${
                  data.current.revenueModel === "PREPAID_PAYG"
                    ? "border-success"
                    : ""
                }`}
              >
                <div className="card-body p-4 d-flex flex-column">
                  <i className="bi bi-wallet2 fs-2 text-success mb-3" />
                  <h2 className="h4">Prepaid Pay As You Go</h2>
                  <p className="text-secondary">
                    Top up before activation and pay only for the metered
                    services you select.
                  </p>
                  <div className="small mb-3">
                    Minimum top-up:{" "}
                    <strong>
                      {formatMoneyMinor(
                        data.minimumTopupMinor,
                        data.current.currency,
                      )}
                    </strong>
                    <br />
                    Wallet available:{" "}
                    <strong>
                      {formatMoneyMinor(
                        data.wallet?.availableMinor ?? "0",
                        data.current.currency,
                      )}
                    </strong>
                  </div>
                  <a
                    className="btn btn-success mt-auto"
                    href="/dashboard/billing/pay-as-you-go"
                  >
                    Top up and configure PAYG
                  </a>
                </div>
              </article>
            </div>

            <div className="col-lg-4">
              <article
                className={`card h-100 ${
                  data.current.revenueModel === "ENTERPRISE_CUSTOM"
                    ? "border-dark"
                    : ""
                }`}
              >
                <div className="card-body p-4 d-flex flex-column">
                  <i className="bi bi-buildings fs-2 mb-3" />
                  <h2 className="h4">Enterprise custom</h2>
                  <p className="text-secondary">
                    Custom limits, commercial terms, migration support and
                    negotiated service commitments.
                  </p>
                  {data.enterpriseInquiry && (
                    <div className="alert alert-info small">
                      {data.enterpriseInquiry.companyName}:{" "}
                      {data.enterpriseInquiry.status.replaceAll("_", " ")}
                    </div>
                  )}
                  <a
                    className="btn btn-dark mt-auto"
                    href="/dashboard/billing/enterprise"
                  >
                    Talk to sales
                  </a>
                </div>
              </article>
            </div>
          </div>
        </>
      )}
    </>
  );
}
