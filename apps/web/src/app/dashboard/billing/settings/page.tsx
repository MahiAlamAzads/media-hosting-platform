"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Feedback, LoadingBlock } from "@/components/feedback";
import { apiRequest } from "@/lib/api";

type Settings = {
  preferredCurrency: "BDT" | "USD";
  preferredInterval: "MONTHLY" | "YEARLY";
  billingEmail: string | null;
  countryCode: string | null;
  taxId: string | null;
  companyName: string | null;
  billingPhone: string | null;
  billingAddress: null | {
    line1?: string;
    line2?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    countryCode?: string;
  };
};

export default function BillingSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<"success" | "danger">("success");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiRequest<{ data: Settings }>("/api/v1/billing/settings")
      .then(response => setSettings(response.data))
      .catch(error => {
        setVariant("danger");
        setMessage(error.message);
      });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const form = new FormData(event.currentTarget);

    try {
      const response = await apiRequest<{ data: Settings }>(
        "/api/v1/billing/settings",
        {
          method: "PATCH",
          body: JSON.stringify({
            preferredCurrency: form.get("preferredCurrency"),
            preferredInterval: form.get("preferredInterval"),
            billingEmail: form.get("billingEmail") || null,
            countryCode: form.get("countryCode") || null,
            taxId: form.get("taxId") || null,
            companyName: form.get("companyName") || null,
            billingPhone: form.get("billingPhone") || null,
            billingAddress: {
              line1: form.get("line1") || undefined,
              line2: form.get("line2") || undefined,
              city: form.get("city") || undefined,
              region: form.get("region") || undefined,
              postalCode: form.get("postalCode") || undefined,
              countryCode: form.get("addressCountryCode") || undefined
            }
          })
        }
      );

      setSettings(response.data);
      setVariant("success");
      setMessage("Billing settings updated.");
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
        title="Billing settings"
        subtitle="Preferred currency, invoice contact and billing identity."
      />

      <Feedback message={message} variant={variant} />

      {!settings ? (
        <LoadingBlock label="Loading billing settings…" />
      ) : (
        <form className="card" onSubmit={submit}>
          <div className="card-header">
            <strong>Billing profile</strong>
          </div>
          <div className="card-body p-4">
            <div className="row g-4">
              <div className="col-md-6">
                <label className="form-label">Preferred currency</label>
                <select
                  className="form-select"
                  name="preferredCurrency"
                  defaultValue={settings.preferredCurrency}
                >
                  <option value="BDT">BDT (৳)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Preferred interval</label>
                <select
                  className="form-select"
                  name="preferredInterval"
                  defaultValue={settings.preferredInterval}
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Billing email</label>
                <input
                  className="form-control"
                  name="billingEmail"
                  type="email"
                  defaultValue={settings.billingEmail ?? ""}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Company name</label>
                <input
                  className="form-control"
                  name="companyName"
                  defaultValue={settings.companyName ?? ""}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Billing phone</label>
                <input
                  className="form-control"
                  name="billingPhone"
                  type="tel"
                  placeholder="+8801XXXXXXXXX"
                  defaultValue={settings.billingPhone ?? ""}
                />
                <div className="form-text">
                  Required for SSLCOMMERZ checkout.
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">Country code</label>
                <input
                  className="form-control text-uppercase"
                  name="countryCode"
                  maxLength={2}
                  placeholder="BD"
                  defaultValue={settings.countryCode ?? ""}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Tax or business ID</label>
                <input
                  className="form-control"
                  name="taxId"
                  defaultValue={settings.taxId ?? ""}
                />
              </div>

              <div className="col-12"><hr /></div>

              <div className="col-12">
                <h2 className="h6">Billing address</h2>
              </div>
              <div className="col-md-6">
                <label className="form-label">Address line 1</label>
                <input
                  className="form-control"
                  name="line1"
                  defaultValue={settings.billingAddress?.line1 ?? ""}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Address line 2</label>
                <input
                  className="form-control"
                  name="line2"
                  defaultValue={settings.billingAddress?.line2 ?? ""}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">City</label>
                <input
                  className="form-control"
                  name="city"
                  defaultValue={settings.billingAddress?.city ?? ""}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Region</label>
                <input
                  className="form-control"
                  name="region"
                  defaultValue={settings.billingAddress?.region ?? ""}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label">Postal code</label>
                <input
                  className="form-control"
                  name="postalCode"
                  defaultValue={settings.billingAddress?.postalCode ?? ""}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label">Country</label>
                <input
                  className="form-control text-uppercase"
                  name="addressCountryCode"
                  maxLength={2}
                  defaultValue={settings.billingAddress?.countryCode ?? ""}
                />
              </div>
            </div>
          </div>
          <div className="card-footer bg-white d-flex justify-content-end">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save billing settings"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
