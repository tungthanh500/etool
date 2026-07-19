import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/lib/prisma";
import { authCookie, createFixtures, resetDb, type Fixtures } from "./helpers/fixtures";

let fx: Fixtures;

beforeEach(async () => {
  await resetDb();
  fx = await createFixtures();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/documents/preview", () => {
  it("không đăng nhập -> 401", async () => {
    const res = await request(app).post("/api/documents/preview").send({ type: "LEAVE", formData: {} });
    expect(res.status).toBe(401);
  });

  it("LEAVE thiếu denNgay -> days:null, không lỗi", async () => {
    const res = await request(app)
      .post("/api/documents/preview")
      .set("Cookie", authCookie(fx.users.staff1.id))
      .send({ type: "LEAVE", formData: { tuNgay: "2026-08-03" } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: "LEAVE", days: null });
  });

  it("LEAVE hợp lệ (Thứ 2 -> Thứ 4, đi làm lại Thứ 4) -> 2 ngày", async () => {
    const res = await request(app)
      .post("/api/documents/preview")
      .set("Cookie", authCookie(fx.users.staff1.id))
      .send({ type: "LEAVE", formData: { tuNgay: "2026-08-03", denNgay: "2026-08-05" } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: "LEAVE", days: 2 });
  });

  it("LEAVE nghỉ trong ngày rơi vào Thứ 7 -> days:null kèm error", async () => {
    const res = await request(app)
      .post("/api/documents/preview")
      .set("Cookie", authCookie(fx.users.staff1.id))
      .send({ type: "LEAVE", formData: { tuNgay: "2026-08-08", denNgay: "2026-08-08" } });
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("LEAVE");
    expect(res.body.days).toBeNull();
    expect(res.body.error).toBe("Ngày nghỉ phải là ngày làm việc (Thứ 2 - Thứ 6)");
  });

  it("PAYMENT tính tổng từ items, soTien dạng chuỗi lẫn số", async () => {
    const res = await request(app)
      .post("/api/documents/preview")
      .set("Cookie", authCookie(fx.users.staff1.id))
      .send({
        type: "PAYMENT",
        formData: { items: [{ soTien: "150000" }, { soTien: 50000 }, { soTien: "" }] },
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: "PAYMENT", tongTien: 200000 });
  });

  it("PAYMENT không có items -> tongTien: 0", async () => {
    const res = await request(app)
      .post("/api/documents/preview")
      .set("Cookie", authCookie(fx.users.staff1.id))
      .send({ type: "PAYMENT", formData: {} });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: "PAYMENT", tongTien: 0 });
  });

  it("type không thuộc LEAVE/PAYMENT -> kind: NONE", async () => {
    const res = await request(app)
      .post("/api/documents/preview")
      .set("Cookie", authCookie(fx.users.staff1.id))
      .send({ type: "GENERAL", formData: { ghiChu: "test" } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: "NONE" });
  });
});
