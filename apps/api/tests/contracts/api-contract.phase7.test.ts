import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app.js";
describe("Phase 7 auth contracts",()=>{
 it("validates public resend verification",async()=>{const r=await request(app).post("/api/v1/auth/resend-verification").send({email:"bad"}).expect(422);expect(r.body.error.code).toBe("VALIDATION_ERROR")});
 it("protects account profile",async()=>{const r=await request(app).get("/api/v1/account/me").expect(401);expect(r.body.error.code).toBe("AUTH_REQUIRED")});
 it("validates public email confirmation",async()=>{const r=await request(app).post("/api/v1/account-public/confirm-email").send({}).expect(422);expect(r.body.error.code).toBe("VALIDATION_ERROR")});
});
