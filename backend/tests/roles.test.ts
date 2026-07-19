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

describe("CRUD vai trò (/api/roles)", () => {
  it("staff (không có user:manage) -> 403", async () => {
    const res = await request(app).get("/api/roles").set("Cookie", authCookie(fx.users.staff1.id));
    expect(res.status).toBe(403);
  });

  it("admin list -> 200 kèm _count.users", async () => {
    const res = await request(app).get("/api/roles").set("Cookie", authCookie(fx.users.admin1.id));
    expect(res.status).toBe(200);
    const admin = res.body.find((r: { name: string }) => r.name === "Admin");
    expect(admin._count.users).toBe(1);
  });

  it("tạo vai trò mới với permission hợp lệ -> 201; trùng tên -> 409", async () => {
    const res = await request(app)
      .post("/api/roles")
      .set("Cookie", authCookie(fx.users.admin1.id))
      .send({ name: "Kiểm soát nội bộ", permissions: ["audit:read", "document:read:own"] });
    expect(res.status).toBe(201);
    expect(res.body.permissions).toEqual(["audit:read", "document:read:own"]);

    const dup = await request(app)
      .post("/api/roles")
      .set("Cookie", authCookie(fx.users.admin1.id))
      .send({ name: "Kiểm soát nội bộ", permissions: [] });
    expect(dup.status).toBe(409);
  });

  it("permission ngoài catalog -> 400", async () => {
    const res = await request(app)
      .post("/api/roles")
      .set("Cookie", authCookie(fx.users.admin1.id))
      .send({ name: "Vai trò lạ", permissions: ["document:delete:all"] });
    expect(res.status).toBe(400);
  });

  it('có "*" thì chuẩn hoá chỉ còn ["*"]', async () => {
    const res = await request(app)
      .post("/api/roles")
      .set("Cookie", authCookie(fx.users.admin1.id))
      .send({ name: "Siêu quản trị", permissions: ["*", "audit:read"] });
    expect(res.status).toBe(201);
    expect(res.body.permissions).toEqual(["*"]);
  });

  it("PATCH tự tước quyền quản trị của role mình đang giữ -> 400", async () => {
    const res = await request(app)
      .patch(`/api/roles/${fx.roles.Admin.id}`)
      .set("Cookie", authCookie(fx.users.admin1.id))
      .send({ name: "Admin", permissions: ["audit:read"] });
    expect(res.status).toBe(400);

    // Giữ lại user:manage thì được (không tự khoá).
    const ok = await request(app)
      .patch(`/api/roles/${fx.roles.Admin.id}`)
      .set("Cookie", authCookie(fx.users.admin1.id))
      .send({ name: "Admin", permissions: ["user:manage", "audit:read"] });
    expect(ok.status).toBe(200);
  });

  it("DELETE role còn user -> 409; role trống -> 204; role mình đang giữ -> 400", async () => {
    const inUse = await request(app)
      .delete(`/api/roles/${fx.roles.Staff.id}`)
      .set("Cookie", authCookie(fx.users.admin1.id));
    expect(inUse.status).toBe(409);

    const own = await request(app)
      .delete(`/api/roles/${fx.roles.Admin.id}`)
      .set("Cookie", authCookie(fx.users.admin1.id));
    expect(own.status).toBe(400);

    const empty = await prisma.role.create({ data: { name: "Vai trò trống", permissions: [] } });
    const res = await request(app)
      .delete(`/api/roles/${empty.id}`)
      .set("Cookie", authCookie(fx.users.admin1.id));
    expect(res.status).toBe(204);
    expect(await prisma.role.findUnique({ where: { id: empty.id } })).toBeNull();
  });
});
