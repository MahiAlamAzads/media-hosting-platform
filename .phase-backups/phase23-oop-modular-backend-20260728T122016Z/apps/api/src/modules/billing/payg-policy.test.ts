import { describe, expect, it } from "vitest";
import { incrementalOverageAmount } from "./payg.service.js";

describe("Phase 13 PAYG pricing", () => {
  it("charges only newly crossed overage units", () => {
    expect(incrementalOverageAmount({
      current: 100n,
      requested: 1n,
      limit: 100n,
      unitSize: 10n,
      unitPriceMinor: 50n
    })).toEqual({
      billableUnits: 1n,
      amountMinor: 50n
    });

    expect(incrementalOverageAmount({
      current: 101n,
      requested: 8n,
      limit: 100n,
      unitSize: 10n,
      unitPriceMinor: 50n
    })).toEqual({
      billableUnits: 0n,
      amountMinor: 0n
    });

    expect(incrementalOverageAmount({
      current: 109n,
      requested: 2n,
      limit: 100n,
      unitSize: 10n,
      unitPriceMinor: 50n
    })).toEqual({
      billableUnits: 1n,
      amountMinor: 50n
    });
  });


  it("charges prepaid PAYG from the first configured unit", () => {
    expect(incrementalOverageAmount({
      current: 0n,
      requested: 1n,
      limit: 0n,
      unitSize: 1n,
      unitPriceMinor: 25n
    })).toEqual({
      billableUnits: 1n,
      amountMinor: 25n
    });
  });

  it("does not charge while usage remains inside the included limit", () => {
    expect(incrementalOverageAmount({
      current: 50n,
      requested: 25n,
      limit: 100n,
      unitSize: 10n,
      unitPriceMinor: 50n
    })).toEqual({
      billableUnits: 0n,
      amountMinor: 0n
    });
  });
});
