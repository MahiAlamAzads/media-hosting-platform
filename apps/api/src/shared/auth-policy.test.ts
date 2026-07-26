import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./auth-policy.js";
describe("normalizeEmail",()=>{it("trims and lowercases",()=>expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com"));});
