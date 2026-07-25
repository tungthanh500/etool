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

// notify() là fire-and-forget (ghi Notification ở background sau khi response trả về) —
// poll ngắn để test tất định thay vì query ngay lập tức (dễ trượt do race).
async function waitForNotifications(where: { userId: string; type: string; documentId: string }, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = await prisma.notification.findMany({ where });
    if (rows.length > 0 || Date.now() > deadline) return rows;
    await new Promise((r) => setTimeout(r, 25));
  }
}

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
  it("creator thu hồi khi PENDING kèm lý do -> WITHDRAWN, log WITHDRAW có comment", async () => {
    const created = await createGeneral(fx.users.staff1.id);
    const res = await request(app)
      .post(`/api/documents/${created.body.id}/withdraw`)
      .set("Cookie", authCookie(fx.users.staff1.id))
      .send({ comment: "Nhầm số tiền, thu hồi để làm lại" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("WITHDRAWN");
    const log = res.body.logs.find((l: { action: string }) => l.action === "WITHDRAW");
    expect(log.comment).toContain("Nhầm số tiền");
  });

  it("thu hồi KHÔNG nêu lý do -> 400", async () => {
    const created = await createGeneral(fx.users.staff1.id);
    const res = await request(app)
      .post(`/api/documents/${created.body.id}/withdraw`)
      .set("Cookie", authCookie(fx.users.staff1.id))
      .send({});
    expect(res.status).toBe(400);
  });

  it("thu hồi văn bản không còn PENDING (đã WITHDRAWN) -> 400", async () => {
    const created = await createGeneral(fx.users.staff1.id);
    const id = created.body.id;
    await request(app).post(`/api/documents/${id}/withdraw`).set("Cookie", authCookie(fx.users.staff1.id)).send({ comment: "lý do" });
    const res = await request(app)
      .post(`/api/documents/${id}/withdraw`)
      .set("Cookie", authCookie(fx.users.staff1.id))
      .send({ comment: "lý do 2" });
    expect(res.status).toBe(400);
  });

  it("thu hồi sau khi đã duyệt 1 bước: báo cả người ĐÃ duyệt lẫn người ĐANG chờ duyệt", async () => {
    // staff1 nộp -> depthead1 duyệt bước 1 -> sang bước 2 (đích danh director1, chưa duyệt).
    const created = await createGeneral(fx.users.staff1.id);
    const id = created.body.id;
    await request(app)
      .post(`/api/documents/${id}/approve`)
      .set("Cookie", authCookie(fx.users.depthead1.id))
      .send({ comment: "ok bước 1" });

    const res = await request(app)
      .post(`/api/documents/${id}/withdraw`)
      .set("Cookie", authCookie(fx.users.staff1.id))
      .send({ comment: "Phát hiện sai sót" });
    expect(res.status).toBe(200);

    // depthead1 (đã duyệt bước 1) VÀ director1 (đang chờ ở bước 2) đều phải nhận thông báo.
    const depthead1Notifs = await waitForNotifications({ userId: fx.users.depthead1.id, type: "document:withdrawn", documentId: id });
    const director1Notifs = await waitForNotifications({ userId: fx.users.director1.id, type: "document:withdrawn", documentId: id });
    expect(depthead1Notifs.length).toBe(1);
    expect(director1Notifs.length).toBe(1);

    // director1 không còn duyệt được nữa.
    const blockedNext = await request(app)
      .post(`/api/documents/${id}/approve`)
      .set("Cookie", authCookie(fx.users.director1.id))
      .send({ comment: "cố duyệt" });
    expect(blockedNext.status).toBe(400);
  });
});

// 6.3: bước "bất kỳ thành viên phòng X" có ≥2 người cùng đủ điều kiện — khi 1 người
// từ chối / yêu cầu chỉnh sửa, người còn lại (chưa hành động) vẫn phải được báo là hồ sơ
// đã rời khỏi hàng chờ của họ.
describe("Thông báo cho đồng cấp khi từ chối / yêu cầu chỉnh sửa (6.3)", () => {
  // Nộp 1 đơn LEAVE của staff1 và đưa tới bước 2 (bất kỳ thành viên Phòng Nhân sự).
  // Thêm hrstaff2 để bước 2 có 2 người: hrstaff + hrstaff2.
  async function leaveAtHrStep() {
    const bcrypt = (await import("bcryptjs")).default;
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    const hr2 = await prisma.user.create({
      data: {
        username: "hrstaff2", email: "hrstaff2@test.local", fullName: "Nhân sự Hai",
        passwordHash, roleId: fx.roles.Staff.id, departmentId: fx.depts.nhanSu.id,
      },
    });
    const created = await request(app)
      .post("/api/documents")
      .set("Cookie", authCookie(fx.users.staff1.id))
      .field("type", "LEAVE")
      .field("formData", JSON.stringify({ tuNgay: "2026-08-01", denNgay: "2026-08-05", loaiNghi: "ANNUAL", lyDo: "x" }));
    const id = created.body.id;
    // staff1 ở Phòng Kỹ thuật -> bước 1 CREATOR_DEPT_HEAD = depthead1 duyệt.
    await request(app).post(`/api/documents/${id}/approve`).set("Cookie", authCookie(fx.users.depthead1.id)).send({ comment: "ok" });
    return { id, hr2Id: hr2.id };
  }

  it("từ chối bởi hrstaff -> hrstaff2 (đồng cấp chưa hành động) vẫn nhận Notification", async () => {
    const { id, hr2Id } = await leaveAtHrStep();
    const res = await request(app)
      .post(`/api/documents/${id}/reject`)
      .set("Cookie", authCookie(fx.users.hrstaff.id))
      .send({ comment: "Không hợp lệ" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REJECTED");

    const hr2Notifs = await waitForNotifications({ userId: hr2Id, type: "document:rejected", documentId: id });
    expect(hr2Notifs.length).toBe(1);
  });

  it("yêu cầu chỉnh sửa bởi hrstaff -> hrstaff2 vẫn nhận Notification", async () => {
    const { id, hr2Id } = await leaveAtHrStep();
    const res = await request(app)
      .post(`/api/documents/${id}/request-change`)
      .set("Cookie", authCookie(fx.users.hrstaff.id))
      .send({ comment: "Bổ sung thông tin" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CHANGES_REQUESTED");

    const hr2Notifs = await waitForNotifications({ userId: hr2Id, type: "document:changes_requested", documentId: id });
    expect(hr2Notifs.length).toBe(1);
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
    expect(skipped[0].meta).toEqual({ skippedStepOrder: 1, reason: "ONLY_CREATOR" });
  });

  it("EMPTY: hrstaff (Phòng Nhân sự không có Trưởng phòng) tạo GENERAL -> bước 1 skip lý do EMPTY", async () => {
    const res = await createGeneral(fx.users.hrstaff.id);
    expect(res.status).toBe(201);
    expect(res.body.currentStep).toBe(2);
    const skipped = res.body.logs.filter((l: { action: string }) => l.action === "STEP_SKIPPED");
    expect(skipped.length).toBe(1);
    expect(skipped[0].comment).toMatch(/^Bỏ qua bước 1/);
    expect(skipped[0].comment).toContain("không có người đảm nhiệm");
    expect(skipped[0].meta).toEqual({ skippedStepOrder: 1, reason: "EMPTY" });
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
