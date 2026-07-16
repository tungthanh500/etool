import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ROLES: { name: string; permissions: string[] }[] = [
  { name: "Staff", permissions: ["document:create", "document:read:own"] },
  { name: "Dept_Head", permissions: ["document:approve:dept"] },
  { name: "Director", permissions: ["document:approve:final"] },
  { name: "Accountant", permissions: ["document:approve:payment"] },
];

const DEPARTMENTS = ["Ban Giám đốc", "Phòng Hành chính - Kế toán"];

// Mật khẩu dùng chung cho tài khoản test, chỉ dành cho môi trường dev cục bộ.
const DEV_PASSWORD = "ChangeMe123!";

const USERS: { email: string; fullName: string; roleName: string; departmentName: string }[] = [
  { email: "staff@example.com", fullName: "Nguyễn Văn Staff", roleName: "Staff", departmentName: "Phòng Hành chính - Kế toán" },
  { email: "depthead@example.com", fullName: "Trần Thị Trưởng Phòng", roleName: "Dept_Head", departmentName: "Phòng Hành chính - Kế toán" },
  { email: "director@example.com", fullName: "Lê Văn Giám Đốc", roleName: "Director", departmentName: "Ban Giám đốc" },
  { email: "accountant@example.com", fullName: "Phạm Thị Kế Toán", roleName: "Accountant", departmentName: "Phòng Hành chính - Kế toán" },
];

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { permissions: role.permissions },
      create: role,
    });
  }

  for (const name of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  for (const u of USERS) {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: u.roleName } });
    const department = await prisma.department.findUniqueOrThrow({ where: { name: u.departmentName } });

    await prisma.user.upsert({
      where: { email: u.email },
      update: { fullName: u.fullName, roleId: role.id, departmentId: department.id },
      create: {
        email: u.email,
        fullName: u.fullName,
        passwordHash,
        roleId: role.id,
        departmentId: department.id,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
