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

// Bộ steps hợp lệ khớp cấu hình GENERAL hiện tại (để PATCH không vướng assertStepsValid).
function generalSteps() {
  return [
    { kind: "CREATOR_DEPT_HEAD" },
    { kind: "DEPARTMENT", departmentId: fx.depts.banGiamDoc.id, approverUserId: fx.users.director1.id },
  ];
}

describe("R20 — chặn sửa bước Workflow khi có văn bản PENDING", () => {
  it("có doc PENDING -> PATCH steps bị chặn 409", async () => {
    await request(app)
      .post("/api/documents")
      .set("Cookie", authCookie(fx.users.staff1.id))
      .field("type", "GENERAL")
      .field("title", "Văn bản thử nghiệm")
      .field("formData", JSON.stringify({ ghiChu: "x" }));

    const res = await request(app)
      .patch(`/api/workflows/${fx.workflows.general.id}`)
      .set("Cookie", authCookie(fx.users.admin1.id))
      .send({ steps: generalSteps() });

    expect(res.status).toBe(409);
  });

  it("không còn doc PENDING (đã REJECTED) -> PATCH steps thành công", async () => {
    const created = await request(app)
      .post("/api/documents")
      .set("Cookie", authCookie(fx.users.staff1.id))
      .field("type", "GENERAL")
      .field("title", "Văn bản thử nghiệm")
      .field("formData", JSON.stringify({ ghiChu: "x" }));
    await request(app)
      .post(`/api/documents/${created.body.id}/reject`)
      .set("Cookie", authCookie(fx.users.depthead1.id))
      .send({ comment: "Loại bỏ" });

    const res = await request(app)
      .patch(`/api/workflows/${fx.workflows.general.id}`)
      .set("Cookie", authCookie(fx.users.admin1.id))
      .send({ steps: generalSteps() });

    expect(res.status).toBe(200);
    const steps = await prisma.workflowStep.findMany({ where: { workflowId: fx.workflows.general.id } });
    expect(steps.length).toBe(2);
  });
});
