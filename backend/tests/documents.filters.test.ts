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

// Dựng 1 doc GENERAL của staff1 đã qua bước 1 (depthead1 duyệt) -> đang chờ bước 2
// (director1). Trả về id để các test lọc dùng.
async function createAndApproveStep1(): Promise<string> {
  const created = await request(app)
    .post("/api/documents")
    .set("Cookie", authCookie(fx.users.staff1.id))
    .field("type", "GENERAL")
    .field("title", "Văn bản test bộ lọc")
    .field("formData", JSON.stringify({ ghiChu: "x" }));
  const approved = await request(app)
    .post(`/api/documents/${created.body.id}/approve`)
    .set("Cookie", authCookie(fx.users.depthead1.id))
    .send({});
  expect(approved.status).toBe(200);
  return created.body.id as string;
}

function todayVN(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

describe("GET /api/users/options", () => {
  it("user thường (không có user:manage) vẫn gọi được -> 200, chỉ {id, fullName}", async () => {
    const res = await request(app).get("/api/users/options").set("Cookie", authCookie(fx.users.staff1.id));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(Object.keys(res.body[0]).sort()).toEqual(["fullName", "id"]);
  });

  it("chưa đăng nhập -> 401", async () => {
    const res = await request(app).get("/api/users/options");
    expect(res.status).toBe(401);
  });
});

describe("Bộ lọc theo lần duyệt (approvedBy/approvedFrom/approvedTo)", () => {
  it("approvedBy đúng người đã duyệt -> thấy; người chưa duyệt -> không", async () => {
    await createAndApproveStep1();

    // director1 là approver bước 2 -> doc nằm trong hàng chờ của director1.
    const hit = await request(app)
      .get(`/api/documents/pending?approvedBy=${fx.users.depthead1.id}`)
      .set("Cookie", authCookie(fx.users.director1.id));
    expect(hit.status).toBe(200);
    expect(hit.body.total).toBe(1);

    const miss = await request(app)
      .get(`/api/documents/pending?approvedBy=${fx.users.director1.id}`)
      .set("Cookie", authCookie(fx.users.director1.id));
    expect(miss.body.total).toBe(0);
  });

  it("khoảng ngày duyệt hôm nay -> thấy; khoảng quá khứ -> không", async () => {
    await createAndApproveStep1();
    const today = todayVN();

    const hit = await request(app)
      .get(`/api/documents/pending?approvedFrom=${today}&approvedTo=${today}`)
      .set("Cookie", authCookie(fx.users.director1.id));
    expect(hit.body.total).toBe(1);

    const miss = await request(app)
      .get("/api/documents/pending?approvedFrom=2020-01-01&approvedTo=2020-01-02")
      .set("Cookie", authCookie(fx.users.director1.id));
    expect(miss.body.total).toBe(0);
  });
});

describe("Bộ lọc theo tên người nộp (creator)", () => {
  it("khớp một phần tên (không phân biệt hoa thường) -> thấy; tên khác -> không", async () => {
    await createAndApproveStep1();

    // fixtures: staff1 fullName "Nhân viên Một".
    const hit = await request(app)
      .get(`/api/documents/pending?creator=${encodeURIComponent("nhân viên một")}`)
      .set("Cookie", authCookie(fx.users.director1.id));
    expect(hit.body.total).toBe(1);

    const miss = await request(app)
      .get(`/api/documents/pending?creator=${encodeURIComponent("Không Tồn Tại")}`)
      .set("Cookie", authCookie(fx.users.director1.id));
    expect(miss.body.total).toBe(0);
  });
});
