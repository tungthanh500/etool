// Chặn tự duyệt: người TẠO văn bản không được duyệt hồ sơ của chính mình,
// dù duyệt bằng quyền bản thân (kịch bản A) hay qua uỷ quyền của người khác (kịch bản B).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
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

describe("Chặn tự duyệt hồ sơ của chính mình", () => {
  it("A — bước 'bất kỳ thành viên phòng X', người tạo cũng thuộc phòng X -> 403", async () => {
    // Thêm người thứ 2 vào Phòng Nhân sự để bước KHÔNG bị auto-skip lý do ONLY_CREATOR.
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    await prisma.user.create({
      data: {
        username: "hrstaff2", email: "hrstaff2@test.local", fullName: "Nhân sự Hai",
        passwordHash, roleId: fx.roles.Staff.id, departmentId: fx.depts.nhanSu.id,
      },
    });

    // hrstaff (Phòng Nhân sự) tự nộp đơn nghỉ phép.
    const created = await request(app)
      .post("/api/documents")
      .set("Cookie", authCookie(fx.users.hrstaff.id))
      .field("type", "LEAVE")
      .field("formData", JSON.stringify({
        tuNgay: "2026-08-01", denNgay: "2026-08-05", loaiNghi: "ANNUAL", lyDo: "test",
      }));
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("PENDING");
    // CHÍNH hrstaff (người tạo) bấm duyệt đơn của mình -> phải bị chặn.
    const approved = await request(app)
      .post(`/api/documents/${created.body.id}/approve`)
      .set("Cookie", authCookie(fx.users.hrstaff.id))
      .field("comment", "tự duyệt");

    expect(approved.status).toBe(403);

    // Văn bản vẫn PENDING ở đúng bước cũ — không bị đổi trạng thái dù request bị chặn.
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(doc.status).toBe("PENDING");
    expect(doc.currentStep).toBe(created.body.currentStep);
  });

  it("B — tự duyệt qua uỷ quyền (người duyệt uỷ quyền cho chính người nộp) -> 403", async () => {
    // staff1 nộp văn bản GENERAL.
    const created = await request(app)
      .post("/api/documents")
      .set("Cookie", authCookie(fx.users.staff1.id))
      .field("type", "GENERAL")
      .field("title", "Văn bản thử")
      .field("formData", JSON.stringify({ ghiChu: "test" }));
    expect(created.status).toBe(201);

    // Trưởng phòng duyệt bước 1 -> sang bước 2 (đích danh director1).
    await request(app)
      .post(`/api/documents/${created.body.id}/approve`)
      .set("Cookie", authCookie(fx.users.depthead1.id))
      .field("comment", "ok");

    // director1 uỷ quyền cho staff1 (chính người nộp) — vd. đi công tác.
    const now = new Date();
    await prisma.delegation.create({
      data: {
        fromUserId: fx.users.director1.id,
        toUserId: fx.users.staff1.id,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
      },
    });

    // staff1 duyệt chính văn bản mình nộp, dưới danh nghĩa "duyệt thay director1" -> phải bị chặn.
    const approved = await request(app)
      .post(`/api/documents/${created.body.id}/approve`)
      .set("Cookie", authCookie(fx.users.staff1.id))
      .field("comment", "tự duyệt qua uỷ quyền");

    expect(approved.status).toBe(403);
  });

  it("C — director1 (không phải người tạo) vẫn duyệt được bình thường qua uỷ quyền cho staff1", async () => {
    // Đối chứng: đảm bảo việc chặn tự-duyệt không phá vỡ luồng uỷ quyền hợp lệ khi
    // người duyệt-thay KHÔNG phải là người tạo văn bản.
    const created = await request(app)
      .post("/api/documents")
      .set("Cookie", authCookie(fx.users.staff2.id))
      .field("type", "GENERAL")
      .field("title", "Văn bản của staff2")
      .field("formData", JSON.stringify({ ghiChu: "test" }));
    expect(created.status).toBe(201);

    await request(app)
      .post(`/api/documents/${created.body.id}/approve`)
      .set("Cookie", authCookie(fx.users.depthead1.id))
      .field("comment", "ok");

    const now = new Date();
    await prisma.delegation.create({
      data: {
        fromUserId: fx.users.director1.id,
        toUserId: fx.users.staff1.id,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
      },
    });

    // staff1 duyệt thay director1 văn bản của staff2 (không phải của chính staff1) -> vẫn hợp lệ.
    const approved = await request(app)
      .post(`/api/documents/${created.body.id}/approve`)
      .set("Cookie", authCookie(fx.users.staff1.id))
      .field("comment", "duyệt thay hợp lệ");

    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("APPROVED");
    const logs = approved.body.logs.filter((l: { action: string }) => l.action === "APPROVE");
    const delegatedLog = logs[logs.length - 1];
    expect(delegatedLog.comment).toContain("duyệt thay");
  });

  it("D — chiều ngược lại: người tạo uỷ quyền RA cho người khác, người đó không được duyệt hộ hồ sơ của người tạo -> 403", async () => {
    // Thêm người thứ 2 vào Phòng Nhân sự để bước KHÔNG bị auto-skip lý do ONLY_CREATOR.
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    await prisma.user.create({
      data: {
        username: "hrstaff2", email: "hrstaff2@test.local", fullName: "Nhân sự Hai",
        passwordHash, roleId: fx.roles.Staff.id, departmentId: fx.depts.nhanSu.id,
      },
    });

    // hrstaff (Phòng Nhân sự) tự nộp đơn nghỉ phép -> bước 2 là "bất kỳ thành viên Phòng Nhân sự".
    const created = await request(app)
      .post("/api/documents")
      .set("Cookie", authCookie(fx.users.hrstaff.id))
      .field("type", "LEAVE")
      .field("formData", JSON.stringify({
        tuNgay: "2026-08-01", denNgay: "2026-08-05", loaiNghi: "ANNUAL", lyDo: "test",
      }));
    expect(created.status).toBe(201);

    // hrstaff (chính người tạo) tự uỷ quyền CHO staff1 — staff1 thuộc phòng khác, không có
    // tư cách hợp lệ nào độc lập trên hồ sơ này. Đây là kiểu "đồng phạm" — có thể là người
    // không hề biết đang được lợi dụng làm bên duyệt hộ.
    const now = new Date();
    await prisma.delegation.create({
      data: {
        fromUserId: fx.users.hrstaff.id,
        toUserId: fx.users.staff1.id,
        startDate: new Date(now.getTime() - 86400000),
        endDate: new Date(now.getTime() + 86400000),
      },
    });

    // staff1 duyệt "thay hrstaff" — nhưng hrstaff chính là người tạo văn bản này.
    const approved = await request(app)
      .post(`/api/documents/${created.body.id}/approve`)
      .set("Cookie", authCookie(fx.users.staff1.id))
      .field("comment", "duyệt thay hrstaff");

    expect(approved.status).toBe(403);
  });

  it("E — uỷ quyền không lan qua tầng thứ 2: creator uỷ quyền cho director1 (bị chặn), director1 (độc lập, hợp lệ) lại uỷ quyền cho admin1 -> admin1 VẪN duyệt được nhờ chính director1, không liên quan gì tới lượt uỷ quyền của creator", async () => {
    // staff2 (không phải staff1, để tránh trùng người) nộp văn bản GENERAL.
    const created = await request(app)
      .post("/api/documents")
      .set("Cookie", authCookie(fx.users.staff2.id))
      .field("type", "GENERAL")
      .field("title", "Văn bản của staff2")
      .field("formData", JSON.stringify({ ghiChu: "test" }));
    expect(created.status).toBe(201);

    // Trưởng phòng duyệt bước 1 -> bước 2 chỉ định đích danh director1.
    await request(app)
      .post(`/api/documents/${created.body.id}/approve`)
      .set("Cookie", authCookie(fx.users.depthead1.id))
      .field("comment", "ok");

    const now = new Date();
    const inRange = { startDate: new Date(now.getTime() - 86400000), endDate: new Date(now.getTime() + 86400000) };

    // (1) staff2 (creator) tự uỷ quyền CHO director1 — vô hiệu do đã chặn ở test D, nhưng
    // vẫn tồn tại trong DB để kiểm tra nó không "rò" sang tầng sau.
    await prisma.delegation.create({ data: { fromUserId: fx.users.staff2.id, toUserId: fx.users.director1.id, ...inRange } });

    // (2) director1 (độc lập, không liên quan tới (1)) uỷ quyền CHO admin1 — lý do khác,
    // vd. director1 đi công tác cho MỌI hồ sơ, không riêng gì hồ sơ của staff2.
    await prisma.delegation.create({ data: { fromUserId: fx.users.director1.id, toUserId: fx.users.admin1.id, ...inRange } });

    // admin1 duyệt — hợp lệ, vì admin1 đang duyệt THAY director1 (người có tư cách thật),
    // không phải "mượn" quyền của staff2 qua chuỗi 2 tầng.
    const approved = await request(app)
      .post(`/api/documents/${created.body.id}/approve`)
      .set("Cookie", authCookie(fx.users.admin1.id))
      .field("comment", "duyệt thay director1");

    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("APPROVED");
    const logs = approved.body.logs.filter((l: { action: string }) => l.action === "APPROVE");
    expect(logs[logs.length - 1].comment).toContain("duyệt thay");
  });
});
