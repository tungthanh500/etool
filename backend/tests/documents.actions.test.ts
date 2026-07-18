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

// Tạo 1 văn bản GENERAL qua API (đường thật) và trả về body response.
async function createGeneral(creatorId: string, ghiChu = "Nội dung thử") {
  const res = await request(app)
    .post("/api/documents")
    .set("Cookie", authCookie(creatorId))
    .field("type", "GENERAL")
    .field("title", "Văn bản thử nghiệm")
    .field("formData", JSON.stringify({ ghiChu }));
  return res;
}

describe("Tạo văn bản GENERAL", () => {
  it("staff1 tạo được, PENDING ở bước 1, có log SUBMIT", async () => {
    const res = await createGeneral(fx.users.staff1.id);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.currentStep).toBe(1);
    const actions = res.body.logs.map((l: { action: string }) => l.action);
    expect(actions).toContain("SUBMIT");
  });
});

describe("Luồng duyệt GENERAL 2 bước", () => {
  it("duyệt bước 1 (depthead1) -> currentStep=2, response.logs chứa log APPROVE vừa tạo", async () => {
    const created = await createGeneral(fx.users.staff1.id);
    const id = created.body.id;

    const res = await request(app)
      .post(`/api/documents/${id}/approve`)
      .set("Cookie", authCookie(fx.users.depthead1.id))
      .send({ comment: "Đồng ý bước 1" });

    expect(res.status).toBe(200);
    expect(res.body.currentStep).toBe(2);
    expect(res.body.status).toBe("PENDING");
    // Bất biến R08: response phải chứa đúng log vừa tạo.
    const approveLogs = res.body.logs.filter((l: { action: string }) => l.action === "APPROVE");
    expect(approveLogs.length).toBe(1);
  });

  it("duyệt bước cuối (director1) -> APPROVED", async () => {
    const created = await createGeneral(fx.users.staff1.id);
    const id = created.body.id;

    await request(app)
      .post(`/api/documents/${id}/approve`)
      .set("Cookie", authCookie(fx.users.depthead1.id))
      .send({});

    const res = await request(app)
      .post(`/api/documents/${id}/approve`)
      .set("Cookie", authCookie(fx.users.director1.id))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");
  });

  it("sai người duyệt (staff2 duyệt bước 1) -> 403", async () => {
    const created = await createGeneral(fx.users.staff1.id);
    const res = await request(app)
      .post(`/api/documents/${created.body.id}/approve`)
      .set("Cookie", authCookie(fx.users.staff2.id))
      .send({});
    expect(res.status).toBe(403);
  });

  it("duyệt văn bản không còn PENDING (đã APPROVED) -> 400", async () => {
    const created = await createGeneral(fx.users.staff1.id);
    const id = created.body.id;
    await request(app).post(`/api/documents/${id}/approve`).set("Cookie", authCookie(fx.users.depthead1.id)).send({});
    await request(app).post(`/api/documents/${id}/approve`).set("Cookie", authCookie(fx.users.director1.id)).send({});
    // Giờ đã APPROVED — duyệt lại phải bị chặn.
    const res = await request(app)
      .post(`/api/documents/${id}/approve`)
      .set("Cookie", authCookie(fx.users.director1.id))
      .send({});
    expect(res.status).toBe(400);
  });

  it("OCC: duyệt lại đúng người bước 1 sau khi bước 1 đã qua -> không còn hợp lệ (403)", async () => {
    const created = await createGeneral(fx.users.staff1.id);
    const id = created.body.id;
    await request(app).post(`/api/documents/${id}/approve`).set("Cookie", authCookie(fx.users.depthead1.id)).send({});
    // depthead1 giờ không phải người duyệt của bước 2 -> 403.
    const res = await request(app)
      .post(`/api/documents/${id}/approve`)
      .set("Cookie", authCookie(fx.users.depthead1.id))
      .send({});
    expect(res.status).toBe(403);
  });
});

describe("Từ chối (reject)", () => {
  it("depthead1 reject có comment -> REJECTED", async () => {
    const created = await createGeneral(fx.users.staff1.id);
    const res = await request(app)
      .post(`/api/documents/${created.body.id}/reject`)
      .set("Cookie", authCookie(fx.users.depthead1.id))
      .send({ comment: "Không đạt yêu cầu" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REJECTED");
  });

  it("reject thiếu comment -> 400", async () => {
    const created = await createGeneral(fx.users.staff1.id);
    const res = await request(app)
      .post(`/api/documents/${created.body.id}/reject`)
      .set("Cookie", authCookie(fx.users.depthead1.id))
      .send({});
    expect(res.status).toBe(400);
  });
});

describe("Yêu cầu chỉnh sửa -> nộp lại", () => {
  it("request-change -> CHANGES_REQUESTED, resubmit đúng creator -> PENDING về bước thật đầu tiên", async () => {
    const created = await createGeneral(fx.users.staff1.id);
    const id = created.body.id;

    const rc = await request(app)
      .post(`/api/documents/${id}/request-change`)
      .set("Cookie", authCookie(fx.users.depthead1.id))
      .send({ comment: "Bổ sung thông tin" });
    expect(rc.status).toBe(200);
    expect(rc.body.status).toBe("CHANGES_REQUESTED");

    const rs = await request(app)
      .post(`/api/documents/${id}/resubmit`)
      .set("Cookie", authCookie(fx.users.staff1.id))
      .send({});
    expect(rs.status).toBe(200);
    expect(rs.body.status).toBe("PENDING");
    expect(rs.body.currentStep).toBe(1);
  });

  it("resubmit bởi người không phải creator (staff2) -> 403", async () => {
    const created = await createGeneral(fx.users.staff1.id);
    const id = created.body.id;
    await request(app)
      .post(`/api/documents/${id}/request-change`)
      .set("Cookie", authCookie(fx.users.depthead1.id))
      .send({ comment: "Sửa lại" });
    const res = await request(app)
      .post(`/api/documents/${id}/resubmit`)
      .set("Cookie", authCookie(fx.users.staff2.id))
      .send({});
    expect(res.status).toBe(403);
  });
});

describe("Thu hồi (withdraw)", () => {
  it("creator thu hồi khi PENDING -> WITHDRAWN", async () => {
    const created = await createGeneral(fx.users.staff1.id);
    const res = await request(app)
      .post(`/api/documents/${created.body.id}/withdraw`)
      .set("Cookie", authCookie(fx.users.staff1.id))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("WITHDRAWN");
  });

  it("thu hồi văn bản không còn PENDING (đã WITHDRAWN) -> 400", async () => {
    const created = await createGeneral(fx.users.staff1.id);
    const id = created.body.id;
    await request(app).post(`/api/documents/${id}/withdraw`).set("Cookie", authCookie(fx.users.staff1.id)).send({});
    const res = await request(app)
      .post(`/api/documents/${id}/withdraw`)
      .set("Cookie", authCookie(fx.users.staff1.id))
      .send({});
    expect(res.status).toBe(400);
  });
});

describe("Tự động bỏ qua bước (auto-skip)", () => {
  it("ONLY_CREATOR: depthead1 tự tạo GENERAL -> bước 1 bị skip, currentStep=2, có log STEP_SKIPPED", async () => {
    // depthead1 là Dept_Head duy nhất của Phòng Kỹ thuật -> bước CREATOR_DEPT_HEAD chỉ có
    // đúng người tạo -> skip lý do ONLY_CREATOR.
    const res = await createGeneral(fx.users.depthead1.id);
    expect(res.status).toBe(201);
    expect(res.body.currentStep).toBe(2);
    const skipped = res.body.logs.filter((l: { action: string }) => l.action === "STEP_SKIPPED");
    expect(skipped.length).toBe(1);
    expect(skipped[0].comment).toMatch(/^Bỏ qua bước 1/);
  });

  it("EMPTY: hrstaff (Phòng Nhân sự không có Trưởng phòng) tạo GENERAL -> bước 1 skip lý do EMPTY", async () => {
    const res = await createGeneral(fx.users.hrstaff.id);
    expect(res.status).toBe(201);
    expect(res.body.currentStep).toBe(2);
    const skipped = res.body.logs.filter((l: { action: string }) => l.action === "STEP_SKIPPED");
    expect(skipped.length).toBe(1);
    expect(skipped[0].comment).toMatch(/^Bỏ qua bước 1/);
    expect(skipped[0].comment).toContain("không có người đảm nhiệm");
  });
});

describe("LEAVE tự sinh PDF", () => {
  it("tạo LEAVE -> Attachment ORIGINAL pdf; duyệt hết -> thêm Attachment APPROVED", async () => {
    const created = await request(app)
      .post("/api/documents")
      .set("Cookie", authCookie(fx.users.staff1.id))
      .field("type", "LEAVE")
      .field(
        "formData",
        // 2026-08-03 (T2) -> 2026-08-05 (T4): 2 ngày làm việc.
        JSON.stringify({ tuNgay: "2026-08-03", denNgay: "2026-08-05", loaiNghi: "ANNUAL", lyDo: "Việc gia đình" }),
      );
    expect(created.status).toBe(201);
    const id = created.body.id;

    const originals = await prisma.attachment.findMany({ where: { documentId: id, kind: "ORIGINAL" } });
    expect(originals.length).toBe(1);
    expect(originals[0].mimeType).toBe("application/pdf");

    // Bước 1 CREATOR_DEPT_HEAD (Phòng Kỹ thuật) -> depthead1.
    await request(app).post(`/api/documents/${id}/approve`).set("Cookie", authCookie(fx.users.depthead1.id)).send({});
    // Bước 2 DEPARTMENT(Phòng Nhân sự) bất kỳ thành viên -> hrstaff.
    const fin = await request(app)
      .post(`/api/documents/${id}/approve`)
      .set("Cookie", authCookie(fx.users.hrstaff.id))
      .send({});
    expect(fin.status).toBe(200);
    expect(fin.body.status).toBe("APPROVED");

    const approved = await prisma.attachment.findMany({ where: { documentId: id, kind: "APPROVED" } });
    expect(approved.length).toBe(1);
    expect(approved[0].mimeType).toBe("application/pdf");
  });
});
