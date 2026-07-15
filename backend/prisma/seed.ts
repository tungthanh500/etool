import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ROLES: { name: string; permissions: string[] }[] = [
  { name: "Staff", permissions: ["document:create", "document:read:own"] },
  { name: "Dept_Head", permissions: ["document:approve:dept"] },
  { name: "Director", permissions: ["document:approve:final"] },
  { name: "Accountant", permissions: ["document:approve:payment"] },
];

const DEPARTMENTS = ["Ban Giám đốc", "Phòng Hành chính - Kế toán"];

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
