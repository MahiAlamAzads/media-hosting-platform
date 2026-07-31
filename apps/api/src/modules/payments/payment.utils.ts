import { randomBytes } from "node:crypto";
import { AppError } from "../../shared/http.js";
import type {
  BillingCurrencyName,
  GatewayValidationRecord,
} from "./payment.types.js";

export function moneyMinorToDecimal(amountMinor: bigint): string {
  const negative = amountMinor < 0n;
  const absolute = negative ? -amountMinor : amountMinor;
  const major = absolute / 100n;
  const minor = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${major}.${minor}`;
}

export function decimalToMoneyMinor(value: string): bigint {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);

  if (!match) {
    throw new AppError(
      422,
      "INVALID_PAYMENT_AMOUNT",
      "Gateway amount is not a valid two-decimal monetary value.",
    );
  }

  const major = match[1];

  if (major === undefined) {
    throw new AppError(
      422,
      "INVALID_PAYMENT_AMOUNT",
      "Gateway amount is missing its whole-number component.",
    );
  }

  return BigInt(major) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

export function createInvoiceNumber(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `INV-${date}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function createGatewayTransactionId(): string {
  return `MP${Date.now().toString(36).toUpperCase()}${randomBytes(5)
    .toString("hex")
    .toUpperCase()}`.slice(0, 30);
}

export function validateGatewayRecord(input: {
  record: GatewayValidationRecord;
  invoiceId: string;
  workspaceId: string;
  transactionId: string;
  currency: BillingCurrencyName;
  amountMinor: bigint;
}): { riskLevel: number; riskTitle: string | null } {
  const { record } = input;

  if (!new Set(["VALID", "VALIDATED"]).has(String(record.status))) {
    throw new AppError(
      409,
      "PAYMENT_NOT_VALID",
      "SSLCOMMERZ did not validate this transaction as successful.",
    );
  }

  if (record.tran_id !== input.transactionId) {
    throw new AppError(
      409,
      "PAYMENT_TRANSACTION_MISMATCH",
      "Gateway transaction ID does not match the payment attempt.",
    );
  }

  if (
    record.value_a !== input.invoiceId ||
    record.value_b !== input.workspaceId
  ) {
    throw new AppError(
      409,
      "PAYMENT_REFERENCE_MISMATCH",
      "Gateway invoice references do not match this workspace.",
    );
  }

  const originalCurrency = String(
    record.currency_type || record.currency || "",
  ).trim();
  const originalAmount = String(
    record.currency_amount || record.amount || "",
  ).trim();

  if (originalCurrency !== input.currency) {
    throw new AppError(
      409,
      "PAYMENT_CURRENCY_MISMATCH",
      "Gateway currency does not match the invoice currency.",
    );
  }

  if (decimalToMoneyMinor(originalAmount) !== input.amountMinor) {
    throw new AppError(
      409,
      "PAYMENT_AMOUNT_MISMATCH",
      "Gateway amount does not match the invoice amount.",
    );
  }

  const riskLevel = Number(record.risk_level ?? 0);

  return {
    riskLevel: Number.isFinite(riskLevel) ? riskLevel : 0,
    riskTitle: typeof record.risk_title === "string" ? record.risk_title : null,
  };
}

export function isValidPaymentProof(
  contentType: string,
  value: Buffer,
): boolean {
  if (contentType === "image/jpeg") {
    return (
      value.length >= 3 &&
      value[0] === 0xff &&
      value[1] === 0xd8 &&
      value[2] === 0xff
    );
  }

  if (contentType === "image/png") {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    return (
      value.length >= signature.length &&
      value.subarray(0, signature.length).equals(signature)
    );
  }

  if (contentType === "image/webp") {
    return (
      value.length >= 12 &&
      value.subarray(0, 4).toString("ascii") === "RIFF" &&
      value.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }

  if (contentType === "application/pdf") {
    return (
      value.length >= 5 && value.subarray(0, 5).toString("ascii") === "%PDF-"
    );
  }

  return false;
}
