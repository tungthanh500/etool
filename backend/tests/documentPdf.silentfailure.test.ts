// Lỗi sinh PDF (đĩa đầy, quyền file, lib PDF crash...) KHÔNG được chặn hành động chính
// (nộp/duyệt) — đây là quyết định thiết kế cố ý, giữ nguyên. Nhưng lỗi đó phải để lại dấu
// vết audit để Admin biết mà xử lý thủ công, không chỉ console.error (không ai đọc log
// server production) — xem lib/documentPdf.ts.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import app from "../src/app";
import { prisma } from "../src/lib/prisma";
import { authCookie, createFixtures, resetDb, type Fixtures } from "./helpers/fixtures";

let fx: Fixtures;

beforeEach(async () => {
  await resetDb();
  fx = await createFixtures();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Sinh PDF đơn nghỉ phép lỗi — vẫn phải để lại dấu vết audit", () => {
  it("nộp đơn thành công (201) dù sinh PDF lỗi, và có AuditLog FILE_GENERATE_FAILED", async () => {
    // Thêm người thứ 2 vào Phòng Nhân sự để bước duyệt không bị auto-skip (ONLY_CREATOR),
    // tránh lẫn với lỗi nghiệp vụ khác không liên quan tới test này.
    const passwordHash = await bcrypt.hash("Test1234!", 10);
    await prisma.user.create({
      data: {
        username: "hrstaff2", email: "hrstaff2@test.local", fullName: "Nhân sự Hai",
        passwordHash, roleId: fx.roles.Staff.id, departmentId: fx.depts.nhanSu.id,
      },
    });

    vi.spyOn(fs, "writeFileSync").mockImplementation(() => {
      throw new Error("Giả lập lỗi đĩa đầy");
    });

    const res = await request(app)
      .post("/api/documents")
      .set("Cookie", authCookie(fx.users.hrstaff.id))
      .field("type", "LEAVE")
      .field("formData", JSON.stringify({
        tuNgay: "2026-08-01", denNgay: "2026-08-05", loaiNghi: "ANNUAL", lyDo: "test",
      }));

    // Hành động chính (nộp đơn) không bị chặn dù PDF lỗi — đúng thiết kế.
    expect(res.status).toBe(201);

    const logs = await prisma.auditLog.findMany({
      where: { category: "FILE", action: "FILE_GENERATE_FAILED", targetId: res.body.id },
    });
    expect(logs.length).toBe(1);
    expect(logs[0].detail).toContain("Giả lập lỗi đĩa đầy");
  });
});
