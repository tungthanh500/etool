import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/lib/prisma";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/health", () => {
  it("DB đang chạy -> 200 {status:ok, db:ok}", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: "ok" });
  });
});
