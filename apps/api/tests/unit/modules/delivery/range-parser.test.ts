import { describe, expect, it } from "vitest";
import { parseByteRange } from "../../../../src/modules/delivery/range-parser.js";

describe("parseByteRange", () => {
  it("returns null when no range is supplied", () => {
    expect(parseByteRange(undefined, 1000)).toBeNull();
  });

  it("parses a fixed byte range", () => {
    expect(parseByteRange("bytes=100-199", 1000)).toEqual({
      start: 100,
      end: 199,
    });
  });

  it("parses an open-ended range", () => {
    expect(parseByteRange("bytes=900-", 1000)).toEqual({
      start: 900,
      end: 999,
    });
  });

  it("parses a suffix range", () => {
    expect(parseByteRange("bytes=-200", 1000)).toEqual({
      start: 800,
      end: 999,
    });
  });

  it("clamps an end beyond file size", () => {
    expect(parseByteRange("bytes=900-2000", 1000)).toEqual({
      start: 900,
      end: 999,
    });
  });

  it.each([
    "bytes=",
    "items=0-10",
    "bytes=100-50",
    "bytes=1000-1001",
    "bytes=a-b",
    "bytes=0-1,3-4",
  ])("rejects invalid range %s", (range) => {
    expect(parseByteRange(range, 1000)).toBeNull();
  });
});
