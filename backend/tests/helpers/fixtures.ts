import bcrypt from "bcryptjs";
import { prisma } from "../../src/lib/prisma";
import { signToken } from "../../src/lib/jwt";

// Permissions copy NGUYÊN VĂN từ prisma/seed.ts (nguồn sự thật về permission strings).
const ROLES: { name: string; permissions: string[] }[] = [
  { name: "Staff", permissions: ["document:create", "document:read:own"] },
  { name: "Dept_Head", permissions: ["document:create", "document:read:own", "document:approve:dept"] },
  { name: "Director", permissions: ["document:create", "document:read:own", "document:approve:final"] },
  { name: "Accountant", permissions: ["document:create", "document:read:own", "document:approve:payment"] },
  { name: "Admin", permissions: ["*"] },
];

// Xoá sạch theo thứ tự con->cha để không vướng ràng buộc khoá ngoại.
export async function resetDb(): Promise<void> {
  await prisma.notification.deleteMany();
  await prisma.documentLog.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.document.deleteMany();
  await prisma.workflowStep.deleteMany();
  await prisma.workflow.deleteMany();
  await prisma.delegation.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.docCounter.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.role.deleteMany();
}

export interface Fixtures {
  roles: Record<string, { id: string }>;
  depts: {
    banGiamDoc: { id: string };
    kyThuat: { id: string };
    nhanSu: { id: string };
  };
  users: {
    staff1: { id: string };
    staff2: { id: string };
    depthead1: { id: string };
    director1: { id: string };
    admin1: { id: string };
    hrstaff: { id: string };
  };
  workflows: {
    general: { id: string };
    leave: { id: string };
  };
}

// Dựng bộ dữ liệu chuẩn cho mọi test. Cấu hình luồng bám theo prisma/seed.ts:
// - GENERAL: bước 1 CREATOR_DEPT_HEAD, bước 2 DEPARTMENT(Ban Giám đốc) đích danh director1.
// - LEAVE:   bước 1 CREATOR_DEPT_HEAD, bước 2 DEPARTMENT(Phòng Nhân sự) bất kỳ thành viên.
// Phòng Nhân sự CỐ Ý không có Dept_Head để test auto-skip lý do EMPTY (bước CREATOR_DEPT_HEAD rỗng).
export async function createFixtures(): Promise<Fixtures> {
  const roleByName: Record<string, { id: string }> = {};
  for (const r of ROLES) {
    const role = await prisma.role.create({ data: r });
    roleByName[r.name] = { id: role.id };
  }

  const banGiamDoc = await prisma.department.create({ data: { name: "Ban Giám đốc" } });
  const kyThuat = await prisma.department.create({ data: { name: "Phòng Kỹ thuật" } });
  const nhanSu = await prisma.department.create({ data: { name: "Phòng Nhân sự" } });

  const passwordHash = await bcrypt.hash("Test1234!", 10);
  const mkUser = (username: string, fullName: string, roleName: string, departmentId: string) =>
    prisma.user.create({
      data: {
        username,
        email: `${username}@test.local`,
        fullName,
        passwordHash,
        roleId: roleByName[roleName].id,
        departmentId,
      },
    });

  const staff1 = await mkUser("staff1", "Nhân viên Một", "Staff", kyThuat.id);
  const staff2 = await mkUser("staff2", "Nhân viên Hai", "Staff", kyThuat.id);
  const depthead1 = await mkUser("depthead1", "Trưởng phòng Kỹ thuật", "Dept_Head", kyThuat.id);
  const director1 = await mkUser("director1", "Giám đốc", "Director", banGiamDoc.id);
  const admin1 = await mkUser("admin1", "Quản trị", "Admin", banGiamDoc.id);
  const hrstaff = await mkUser("hrstaff", "Nhân sự", "Staff", nhanSu.id);

  const general = await prisma.workflow.create({
    data: {
      name: "GENERAL",
      description: "Trình duyệt văn bản chung",
      steps: {
        create: [
          { stepOrder: 1, kind: "CREATOR_DEPT_HEAD" },
          { stepOrder: 2, kind: "DEPARTMENT", departmentId: banGiamDoc.id, approverUserId: director1.id },
        ],
      },
    },
  });

  const leave = await prisma.workflow.create({
    data: {
      name: "LEAVE",
      description: "Đơn xin nghỉ phép",
      steps: {
        create: [
          { stepOrder: 1, kind: "CREATOR_DEPT_HEAD" },
          { stepOrder: 2, kind: "DEPARTMENT", departmentId: nhanSu.id, approverUserId: null },
        ],
      },
    },
  });

  return {
    roles: roleByName,
    depts: { banGiamDoc, kyThuat, nhanSu },
    users: { staff1, staff2, depthead1, director1, admin1, hrstaff },
    workflows: { general, leave },
  };
}

const COOKIE_NAME = process.env.COOKIE_NAME || "eapproval_token";

// Mint token trực tiếp thay vì đăng nhập qua API — tránh rate limit login (10 lần/15 phút/IP).
export function authCookie(userId: string): string {
  return `${COOKIE_NAME}=${signToken(userId)}`;
}
