import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Mục 5.6C: mọi role đều tạo được văn bản (kể cả Trưởng phòng/Giám đốc cũng cần xin
// nghỉ phép...) — an toàn vì quy tắc tự động bỏ qua bước (5.6B) đã chặn tự duyệt đơn
// của chính mình. Quyền DUYỆT giờ đến từ VỊ TRÍ trong luồng (WorkflowStep), không còn
// từ permission role nữa — các quyền "document:approve:*" dưới đây chỉ còn dùng để
// quyết định hiện/ẩn UI (card Uỷ quyền/Chữ ký mẫu — xem canApproveAnything() frontend).
const ROLES: { name: string; permissions: string[] }[] = [
  { name: "Staff", permissions: ["document:create", "document:read:own"] },
  { name: "Dept_Head", permissions: ["document:create", "document:read:own", "document:approve:dept"] },
  // Giám đốc thuần duyệt nghiệp vụ — mọi quyền quản trị đã chuyển về role Admin.
  { name: "Director", permissions: ["document:create", "document:read:own", "document:approve:final"] },
  { name: "Accountant", permissions: ["document:create", "document:read:own", "document:approve:payment"] },
  // Admin: superuser toàn hệ thống. "*" được middleware authorize hiểu là mọi quyền.
  { name: "Admin", permissions: ["*"] },
];

// Mục 5.1: "Phòng Nhân sự" cho luồng LEAVE — không cần role HR riêng, quyền duyệt đến
// từ vị trí trong luồng (mô hình 5.6), user hr chỉ cần role Staff bình thường.
const DEPARTMENTS = ["Ban Giám đốc", "Phòng Hành chính - Kế toán", "Phòng Nhân sự"];

// Mật khẩu dùng chung cho tài khoản test, chỉ dành cho môi trường dev cục bộ.
const DEV_PASSWORD = "ChangeMe123!";

// CHỈ còn 2 tài khoản mẫu: admin (bootstrap ban đầu) + hr (cần cho luồng LEAVE mới).
// Đã BỎ staff/depthead/director/accountant — hệ thống này đang chạy với user thật do
// Admin tự tạo qua UI; seed chạy lại (vd. sau lần deploy mới) sẽ hồi sinh các tài khoản
// demo này nếu còn trong danh sách (email demo không tồn tại nữa nên upsert coi là mới),
// từng gây sự cố thật khi WORKFLOWS bên dưới vô tình chọn nhầm demo user làm approver
// (xem Bước 35, IMPLEMENTATION_PLAN.md) — đã sửa tận gốc bằng cách bỏ demo user + đổi
// WORKFLOWS sang không cần đích danh (xem dưới), nhưng vẫn loại hẳn khỏi danh sách cho chắc.
const USERS: { username: string; email: string; fullName: string; roleName: string; departmentName: string }[] = [
  { username: "admin", email: "admin@example.com", fullName: "Quản trị hệ thống", roleName: "Admin", departmentName: "Ban Giám đốc" },
  // "nhansu" chứ không phải "hr": username phải ≥3 ký tự theo usernameSchema (routes/users.ts)
  // — seed từng tạo "hr" 2 ký tự khiến Admin không sửa được user này qua UI (pattern chặn).
  { username: "nhansu", email: "hr@example.com", fullName: "Đỗ Thị Nhân Sự", roleName: "Staff", departmentName: "Phòng Nhân sự" },
];

// Mô hình bước duyệt (mục 5.6): CREATOR_DEPT_HEAD không cần thêm dữ liệu; DEPARTMENT
// chỉ định phòng ban — cố ý KHÔNG đích danh user cụ thể ở seed mặc định (không có "user
// mẫu Director/Accountant" nào đáng tin cậy để gán cứng — môi trường thật sẽ có Admin tự
// chỉ định đích danh qua Workflow Builder sau khi tạo user thật, xem mục 5.6 UI).
type StepSeed =
  | { kind: "CREATOR_DEPT_HEAD" }
  | { kind: "DEPARTMENT"; departmentName: string };

// Workflow.name quy ước trùng với Document.type để route tạo document tra cứu trực tiếp.
// CHỈ dùng để khởi tạo lần đầu (fresh install) — workflow đã tồn tại thì seed KHÔNG đụng
// vào steps/description nữa (xem vòng lặp bên dưới), tránh ghi đè cấu hình thật Admin đã
// tự chỉnh qua UI (đúng sự cố đã xảy ra ở Bước 35).
const WORKFLOWS: { name: string; description: string; steps: StepSeed[] }[] = [
  {
    name: "GENERAL",
    description: "Trình duyệt văn bản chung",
    steps: [{ kind: "CREATOR_DEPT_HEAD" }, { kind: "DEPARTMENT", departmentName: "Ban Giám đốc" }],
  },
  {
    name: "PURCHASE",
    description: "Đơn hàng",
    steps: [{ kind: "CREATOR_DEPT_HEAD" }, { kind: "DEPARTMENT", departmentName: "Ban Giám đốc" }],
  },
  {
    name: "PAYMENT",
    description: "Đề xuất thanh toán",
    steps: [
      { kind: "CREATOR_DEPT_HEAD" },
      { kind: "DEPARTMENT", departmentName: "Phòng Hành chính - Kế toán" },
      { kind: "DEPARTMENT", departmentName: "Ban Giám đốc" },
    ],
  },
  {
    name: "LEAVE",
    description: "Đơn xin nghỉ phép",
    steps: [
      { kind: "CREATOR_DEPT_HEAD" },
      // Bất kỳ thành viên nào của Phòng Nhân sự (không đích danh) — đúng yêu cầu người dùng.
      { kind: "DEPARTMENT", departmentName: "Phòng Nhân sự" },
    ],
  },
];

function assertSafeToSeed() {
  if (process.env.NODE_ENV === "production" && process.env.FORCE_SEED !== "1") {
    console.error(
      "Từ chối chạy seed trên production (NODE_ENV=production) vì sẽ reset mật khẩu các user mẫu về giá trị dùng chung. " +
        "Nếu chắc chắn muốn chạy, đặt FORCE_SEED=1.",
    );
    process.exit(1);
  }
}

async function main() {
  assertSafeToSeed();

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
      update: { username: u.username, fullName: u.fullName, roleId: role.id, departmentId: department.id },
      create: {
        username: u.username,
        email: u.email,
        fullName: u.fullName,
        passwordHash,
        roleId: role.id,
        departmentId: department.id,
      },
    });
  }

  for (const wf of WORKFLOWS) {
    const existing = await prisma.workflow.findFirst({ where: { name: wf.name } });
    // Workflow đã tồn tại -> BỎ QUA hoàn toàn (không sửa description, không đụng steps).
    // Admin có thể đã tự chỉnh qua UI (đích danh người duyệt, đổi phòng ban...) — seed chỉ
    // lo phần khởi tạo lần đầu, không phải nguồn sự thật cho môi trường đang chạy thật.
    if (existing) continue;

    const workflow = await prisma.workflow.create({ data: { name: wf.name, description: wf.description } });
    const stepsData = await Promise.all(
      wf.steps.map(async (s, index) => {
        if (s.kind === "CREATOR_DEPT_HEAD") {
          return { workflowId: workflow.id, stepOrder: index + 1, kind: "CREATOR_DEPT_HEAD" as const };
        }
        const department = await prisma.department.findUniqueOrThrow({ where: { name: s.departmentName } });
        return {
          workflowId: workflow.id,
          stepOrder: index + 1,
          kind: "DEPARTMENT" as const,
          departmentId: department.id,
          approverUserId: null,
        };
      }),
    );
    await prisma.workflowStep.createMany({ data: stepsData });
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
