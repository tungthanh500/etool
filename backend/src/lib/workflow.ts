import type { Document, DocumentLog, Prisma, Role, User, WorkflowStep } from "@prisma/client";
import { prisma } from "./prisma";

type DocumentWithWorkflow = Document & {
  workflow: { steps: WorkflowStep[] };
  creator: { departmentId: string };
  logs?: DocumentLog[];
};

type AuthUser = User & { role: Role };

// Prisma tx client và prisma singleton có cùng shape truy vấn (User/Department...) —
// dùng type này để các helper đọc dữ liệu chạy được cả trong lẫn ngoài transaction.
type QueryClient = typeof prisma | Prisma.TransactionClient;

export function getCurrentWorkflowStep(document: DocumentWithWorkflow): WorkflowStep | undefined {
  return document.workflow.steps.find((s) => s.stepOrder === document.currentStep);
}

// Mô hình bước duyệt (mục 5.6): quyền duyệt đến từ VỊ TRÍ trong luồng, không còn từ role.
// - CREATOR_DEPT_HEAD: người duyệt là Trưởng phòng CÙNG phòng ban với người tạo văn bản.
// - DEPARTMENT: approverUserId có giá trị -> CHỈ đích danh người đó; NULL -> BẤT KỲ
//   thành viên active nào của phòng departmentId.
// Chỉ kiểm tra vị trí trong luồng — KHÔNG chặn tự duyệt ở đây, vì tham số `approver` có
// thể là 1 delegator (không phải người đang thực hiện hành động thật). Chặn tự duyệt phải
// dựa trên danh tính người GỌI API, xem isCurrentApprover/findActingDelegator bên dưới.
function matchesCurrentStep(document: DocumentWithWorkflow, approver: AuthUser): boolean {
  if (document.status !== "PENDING") return false;
  const step = getCurrentWorkflowStep(document);
  if (!step) return false;

  if (step.kind === "CREATOR_DEPT_HEAD") {
    return approver.role.name === "Dept_Head" && approver.departmentId === document.creator.departmentId;
  }
  // DEPARTMENT
  if (approver.departmentId !== step.departmentId) return false;
  if (step.approverUserId) return approver.id === step.approverUserId;
  return true;
}

// Người đang uỷ quyền cho userId tại thời điểm hiện tại (startDate <= now <= endDate).
// Chỉ tính người uỷ quyền còn hoạt động — user bị vô hiệu hoá thì uỷ quyền cũng treo.
export async function getActiveDelegators(userId: string): Promise<AuthUser[]> {
  const now = new Date();
  const delegations = await prisma.delegation.findMany({
    where: {
      toUserId: userId,
      startDate: { lte: now },
      endDate: { gte: now },
      fromUser: { isActive: true },
    },
    include: { fromUser: { include: { role: true } } },
  });
  return delegations.map((d) => d.fromUser);
}

// user có phải người duyệt ở bước hiện tại không — bằng chính quyền của mình,
// HOẶC qua bất kỳ uỷ quyền đang hiệu lực nào (nếu truyền delegators vào).
// CHẶN TỰ DUYỆT — 2 CHIỀU:
// (1) `user` (người ĐANG THỰC HIỆN hành động, lấy từ req.user) chính là người tạo văn bản
//     -> chặn ngay, bất kể họ dùng quyền bản thân hay mượn quyền qua uỷ quyền.
// (2) Người tạo văn bản NẰM TRONG danh sách delegators -> chặn luôn nhánh đó, vì người tạo
//     có thể tự uỷ quyền (POST /api/delegations không giới hạn quan hệ) CHO một người khác
//     rồi để người đó "duyệt thay mình" — bản chất vẫn là người tạo tự quyết định hồ sơ của
//     mình, chỉ mượn danh tính người khác để thực hiện. Không đủ nếu chỉ chặn (1): người
//     khác gọi API vẫn pass qua matchesCurrentStep(document, creatorAsDelegator) vì hàm đó
//     không biết gì về creatorId, chỉ khớp vị trí trong luồng.
export function isCurrentApprover(
  document: DocumentWithWorkflow,
  user: AuthUser,
  delegators: AuthUser[] = [],
): boolean {
  if (user.id === document.creatorId) return false;
  if (matchesCurrentStep(document, user)) return true;
  return delegators.some((d) => d.id !== document.creatorId && matchesCurrentStep(document, d));
}

// Trả về người uỷ quyền mà user đang "duyệt thay" trên hồ sơ này — null nếu user
// duyệt bằng chính quyền của mình (quyền bản thân được ưu tiên, không tính là duyệt thay).
// Loại trừ document.creatorId khỏi danh sách tìm — dù isCurrentApprover đã chặn hành động
// tự duyệt (nên hàm này chỉ được gọi khi thực sự có 1 delegator hợp lệ khác), vẫn giữ điều
// kiện này ở đây để log audit không bao giờ ghi nhầm "duyệt thay uỷ quyền bởi chính người
// tạo" khi delegators chứa nhiều người và creator vô tình khớp vị trí đứng trước người hợp lệ.
export function findActingDelegator(
  document: DocumentWithWorkflow,
  user: AuthUser,
  delegators: AuthUser[],
): AuthUser | null {
  if (matchesCurrentStep(document, user)) return null;
  return delegators.find((d) => d.id !== document.creatorId && matchesCurrentStep(document, d)) ?? null;
}

export function canViewDocument(
  document: DocumentWithWorkflow & { logs: DocumentLog[] },
  user: AuthUser,
  delegators: AuthUser[] = [],
): boolean {
  if (document.creatorId === user.id) return true;
  if (isCurrentApprover(document, user, delegators)) return true;
  return document.logs.some((l) => l.userId === user.id);
}

// userId các thành viên ACTIVE hợp lệ để duyệt 1 bước cụ thể — dùng cả cho thông báo
// (notifications.ts) lẫn quy tắc tự động bỏ qua bước (resolveEffectiveStep bên dưới).
export async function getStepApproverIds(
  step: Pick<WorkflowStep, "kind" | "departmentId" | "approverUserId">,
  creatorDepartmentId: string,
  client: QueryClient = prisma,
): Promise<string[]> {
  if (step.kind === "CREATOR_DEPT_HEAD") {
    const users = await client.user.findMany({
      where: { isActive: true, departmentId: creatorDepartmentId, role: { name: "Dept_Head" } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  // DEPARTMENT
  if (step.approverUserId) {
    const user = await client.user.findUnique({
      where: { id: step.approverUserId },
      select: { id: true, isActive: true },
    });
    return user?.isActive ? [user.id] : [];
  }
  if (!step.departmentId) return [];
  const users = await client.user.findMany({
    where: { isActive: true, departmentId: step.departmentId },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export interface SkippedStep {
  stepOrder: number;
  reason: "EMPTY" | "ONLY_CREATOR";
}

export interface ResolvedStep {
  // null = mọi bước từ fromStepOrder trở đi đều bị bỏ qua -> văn bản coi như duyệt xong.
  finalStepOrder: number | null;
  skipped: SkippedStep[];
}

// Quy tắc tự động bỏ qua bước (mục 5.6B): đi từ fromStepOrder trở đi, bỏ qua bước nào
// (a) không có ai đủ điều kiện duyệt (rỗng), hoặc (b) người đủ điều kiện duy nhất chính
// là người tạo văn bản (chặn tự duyệt) — dừng lại ở bước đầu tiên còn người duyệt "thật".
// Gọi khi: tạo văn bản mới (from=1), sau khi duyệt 1 bước (from=bước vừa qua+1), và khi
// nộp lại sau yêu cầu chỉnh sửa (from=currentStep hiện tại, có thể đã hết hiệu lực).
export async function resolveEffectiveStep(
  steps: WorkflowStep[],
  fromStepOrder: number,
  creatorId: string,
  creatorDepartmentId: string,
  client: QueryClient = prisma,
): Promise<ResolvedStep> {
  const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
  const skipped: SkippedStep[] = [];

  for (const step of sorted) {
    if (step.stepOrder < fromStepOrder) continue;
    const approverIds = await getStepApproverIds(step, creatorDepartmentId, client);
    if (approverIds.length === 0) {
      skipped.push({ stepOrder: step.stepOrder, reason: "EMPTY" });
      continue;
    }
    const realApprovers = approverIds.filter((id) => id !== creatorId);
    if (realApprovers.length === 0) {
      skipped.push({ stepOrder: step.stepOrder, reason: "ONLY_CREATOR" });
      continue;
    }
    return { finalStepOrder: step.stepOrder, skipped };
  }
  return { finalStepOrder: null, skipped };
}

// Lọc thô Ở DB "workflow của hồ sơ có khả năng đang chờ user này (hoặc người uỷ quyền
// cho họ) duyệt ở ĐÂU ĐÓ" — dùng cho GET /pending và dashboard.pendingForMe để giảm tập
// cần tải trước khi hậu kiểm isCurrentApprover() chính xác ở app layer. Không diễn đạt
// được điều kiện "đúng BƯỚC HIỆN TẠI" trong 1 `where` Document (so sánh currentStep của
// Document với stepOrder của WorkflowStep là 2 cột khác bảng) — giới hạn đã có từ trước
// khi còn approverRole, mô hình mới KHÔNG làm giới hạn này tệ hơn, chỉ chính xác hơn ở
// phần DEPARTMENT (departmentId/approverUserId match được thẳng, role thì không).
export function buildPendingWorkflowFilter(
  user: AuthUser,
  delegators: AuthUser[],
): Prisma.DocumentWhereInput["workflow"] {
  const people = [user, ...delegators];
  const deptIds = [...new Set(people.map((p) => p.departmentId))];
  const userIds = people.map((p) => p.id);
  const anyIsDeptHead = people.some((p) => p.role.name === "Dept_Head");

  const or: Prisma.WorkflowStepWhereInput[] = [
    {
      kind: "DEPARTMENT",
      departmentId: { in: deptIds },
      OR: [{ approverUserId: null }, { approverUserId: { in: userIds } }],
    },
  ];
  if (anyIsDeptHead) or.push({ kind: "CREATOR_DEPT_HEAD" });

  return { steps: { some: { OR: or } } };
}

// Nhãn mô tả 1 bước để hiện trong stepper/timeline (dùng chung backend<->log; frontend
// có bản tương đương riêng vì cần đọc từ payload API, không import được module backend).
export function describeStep(
  step: Pick<WorkflowStep, "kind" | "departmentId" | "approverUserId">,
  departmentName?: string,
  approverName?: string,
): string {
  if (step.kind === "CREATOR_DEPT_HEAD") return "Trưởng phòng (phòng người nộp)";
  if (step.approverUserId) return `${departmentName ?? "?"} — ${approverName ?? "?"}`;
  return `${departmentName ?? "?"} — bất kỳ thành viên`;
}
