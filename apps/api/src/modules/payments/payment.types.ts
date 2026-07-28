export type BillingCurrencyName = "BDT" | "USD";
export type BillingIntervalName = "MONTHLY" | "YEARLY";

export type GatewayValidationRecord = {
  status?: string;
  tran_id?: string;
  val_id?: string;
  amount?: string | number;
  currency?: string;
  currency_type?: string;
  currency_amount?: string | number;
  bank_tran_id?: string;
  risk_level?: string | number;
  risk_title?: string;
  value_a?: string;
  value_b?: string;
  [key: string]: unknown;
};
