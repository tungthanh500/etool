import type { Document, DocumentLog, Role, User, WorkflowStep } from "@prisma/client";
import { prisma } from "./prisma";

type DocumentWithWorkflow = Document & {
  workflow: { steps: WorkflowStep[] };
  creator: { departmentId: string };
  logs?: DocumentLog[];
};

type AuthUser = User & { role: Role };

export function getCurrentWorkflowStep(document: DocumentWithWorkflow): WorkflowStep | undefined {
  return document.workflow.steps.find((s) => s.stepOrder === document.currentStep);
}

// Dept_Head chỉ được duyệt hồ sơ của người tạo cùng phòng ban với mình —
// tránh trưởng phòng A duyệt nhầm/chéo hồ sơ của phòng ban B chỉ vì trùng role.name.
// Khi duyệt theo uỷ quyền (mục 4.1), "mình" ở đây là NGƯỜI UỶ QUYỀN: người nhận
// thừa hưởng nguyên role + phòng ban của người uỷ quyền, không dùng của bản thân.
function matchesCurrentStep(document: DocumentWithWorkflow, approver: AuthUser): boolean {
  if (document.status !== "PENDING") return false;
  const step = getCurrentWorkflowStep(document);
  if (!step || step.approverRole !== approver.role.name) return false;
  if (step.approverRole === "Dept_Head") {
    return document.creator.departmentId === approver.departmentId;
  }
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
export function isCurrentApprover(
  document: DocumentWithWorkflow,
  user: AuthUser,
  delegators: AuthUser[] = [],
): boolean {
  if (matchesCurrentStep(document, user)) return true;
  return delegators.some((d) => matchesCurrentStep(document, d));
}

// Trả về người uỷ quyền mà user đang "duyệt thay" trên hồ sơ này — null nếu user
// duyệt bằng chính quyền của mình (quyền bản thân được ưu tiên, không tính là duyệt thay).
export function findActingDelegator(
  document: DocumentWithWorkflow,
  user: AuthUser,
  delegators: AuthUser[],
): AuthUser | null {
  if (matchesCurrentStep(document, user)) return null;
  return delegators.find((d) => matchesCurrentStep(document, d)) ?? null;
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
