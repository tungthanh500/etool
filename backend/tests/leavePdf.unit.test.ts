import { describe, expect, it } from "vitest";
import { buildLeaveStepRows } from "../src/lib/leavePdf";

// Unit test thuần (không DB) cho logic ghép bước bị skip — kiểm chứng ưu tiên meta,
// fallback regex comment cho log cũ trước migration meta.
const steps = [
  { stepOrder: 1, kind: "CREATOR_DEPT_HEAD", departmentId: null, approverUserId: null, department: null, approverUser: null },
  { stepOrder: 2, kind: "DEPARTMENT", departmentId: "d1", approverUserId: null, department: { name: "Phòng Nhân sự" }, approverUser: null },
];

function skippedLog(meta: unknown, comment: string | null) {
  return {
    action: "STEP_SKIPPED",
    comment,
    meta,
    createdAt: new Date(),
    user: { fullName: "Hệ thống", signatureUrl: null },
  };
}

describe("buildLeaveStepRows — nhận diện bước bị skip", () => {
  it("dùng meta có cấu trúc khi có", () => {
    const rows = buildLeaveStepRows(steps, [skippedLog({ skippedStepOrder: 2, reason: "EMPTY" }, "text bất kỳ không khớp regex")]);
    expect(rows[1].skipped).toBe(true);
    expect(rows[0].skipped).toBeUndefined();
  });

  it("fallback regex comment khi meta null (log cũ)", () => {
    const rows = buildLeaveStepRows(steps, [skippedLog(null, "Bỏ qua bước 2 — không có người đảm nhiệm")]);
    expect(rows[1].skipped).toBe(true);
    expect(rows[0].skipped).toBeUndefined();
  });
});
