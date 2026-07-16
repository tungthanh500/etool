import type { Document, DocumentLog, Role, User, WorkflowStep } from "@prisma/client";

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
export function isCurrentApprover(document: DocumentWithWorkflow, user: AuthUser): boolean {
  if (document.status !== "PENDING") return false;
  const step = getCurrentWorkflowStep(document);
  if (!step || step.approverRole !== user.role.name) return false;
  if (step.approverRole === "Dept_Head") {
    return document.creator.departmentId === user.departmentId;
  }
  return true;
}

export function canViewDocument(
  document: DocumentWithWorkflow & { logs: DocumentLog[] },
  user: AuthUser,
): boolean {
  if (document.creatorId === user.id) return true;
  if (isCurrentApprover(document, user)) return true;
  return document.logs.some((l) => l.userId === user.id);
}
