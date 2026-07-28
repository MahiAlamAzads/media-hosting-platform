import { describe, expect, it } from "vitest";
import {
  decimalToMoneyMinor,
  isValidPaymentProof,
  moneyMinorToDecimal,
  validateGatewayRecord
} from "../../../../src/modules/payments/payment.utils.js";

describe("payment money utilities", () => {
  it("formats BDT and USD minor units without floating point", () => {
    expect(moneyMinorToDecimal(99000n)).toBe("990.00");
    expect(moneyMinorToDecimal(900n)).toBe("9.00");
    expect(decimalToMoneyMinor("2990.00")).toBe(299000n);
    expect(decimalToMoneyMinor("29.9")).toBe(2990n);
  });

  it("validates original USD currency and amount", () => {
    expect(validateGatewayRecord({
      record: {
        status: "VALID",
        tran_id: "TX1",
        value_a: "invoice1",
        value_b: "workspace1",
        currency: "BDT",
        amount: "1100.00",
        currency_type: "USD",
        currency_amount: "9.00",
        risk_level: "0"
      },
      invoiceId: "invoice1",
      workspaceId: "workspace1",
      transactionId: "TX1",
      currency: "USD",
      amountMinor: 900n
    })).toEqual({ riskLevel: 0, riskTitle: null });
  });

  it("falls back to BDT settlement fields when original fields are empty", () => {
    expect(validateGatewayRecord({
      record: {
        status: "VALIDATED",
        tran_id: "TX2",
        value_a: "invoice2",
        value_b: "workspace2",
        currency: "BDT",
        amount: "990.00",
        currency_amount: "",
        risk_level: "1"
      },
      invoiceId: "invoice2",
      workspaceId: "workspace2",
      transactionId: "TX2",
      currency: "BDT",
      amountMinor: 99000n
    })).toEqual({ riskLevel: 1, riskTitle: null });
  });

  it("rejects invoice amount mismatches", () => {
    expect(() => validateGatewayRecord({
      record: {
        status: "VALIDATED",
        tran_id: "TX1",
        value_a: "invoice1",
        value_b: "workspace1",
        currency_type: "BDT",
        currency_amount: "989.00"
      },
      invoiceId: "invoice1",
      workspaceId: "workspace1",
      transactionId: "TX1",
      currency: "BDT",
      amountMinor: 99000n
    })).toThrow(/amount/i);
  });
});

describe("payment proof inspection", () => {
  it("accepts valid PNG and PDF signatures", () => {
    expect(isValidPaymentProof(
      "image/png",
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])
    )).toBe(true);

    expect(isValidPaymentProof(
      "application/pdf",
      Buffer.from("%PDF-1.7\n")
    )).toBe(true);
  });

  it("rejects files whose declared type does not match the bytes", () => {
    expect(isValidPaymentProof(
      "image/png",
      Buffer.from("not-a-png")
    )).toBe(false);

    expect(isValidPaymentProof(
      "application/pdf",
      Buffer.from([0xff, 0xd8, 0xff, 0x00])
    )).toBe(false);
  });
});

