import type { DocumentStatus, WorkflowStepKind } from "@etool/shared";

// Re-export contract dùng chung để phần frontend còn lại import từ "../types" như trước.
export type { DocumentStatus, WorkflowStepKind } from "@etool/shared";

export interface Role {
  id: string;
  name: string;
  permissions: string[];
}

export interface Department {
  id: string;
  name: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  roleId: string;
  departmentId: string;
  createdAt: string;
  mustChangePassword: boolean;
  isActive: boolean;
  signatureUrl: string | null;
  role: Role;
  department: Department;
}

export interface SafeUser {
  id: string;
  fullName: string;
  email: string;
  departmentId: string;
}

export interface Attachment {
  id: string;
  documentId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  kind: string; // "ORIGINAL" | "APPROVED"
  createdAt: string;
}

export interface AuditLog {
  id: string;
  category: string; // AUTH | DOCUMENT | USER | WORKFLOW | FILE
  action: string;
  actorId: string | null;
  actor: { id: string; fullName: string; email: string } | null;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  ip: string | null;
  createdAt: string;
}

export interface AuditLogPage {
  items: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

export interface WorkflowStep {
  id: string;
  workflowId: string;
  stepOrder: number;
  kind: WorkflowStepKind;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  approverUserId: string | null;
  approverUser: { id: string; fullName: string } | null;
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  steps: WorkflowStep[];
}

export interface DocumentLog {
  id: string;
  documentId: string;
  userId: string;
  action: string;
  comment: string | null;
  createdAt: string;
  user: SafeUser;
}

export interface DocumentSummary {
  id: string;
  docNo: string | null;
  title: string;
  type: string;
  formData: unknown;
  status: DocumentStatus;
  creatorId: string;
  currentStep: number;
  workflowId: string;
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
  creator: SafeUser;
  workflow: Workflow;
  canApprove: boolean;
}

export interface DocumentDetail extends DocumentSummary {
  logs: DocumentLog[];
  // Tên người uỷ quyền nếu user hiện tại chỉ có quyền duyệt văn bản này QUA uỷ quyền
  // (null khi duyệt bằng chính quyền của mình hoặc không có quyền duyệt).
  approvingVia?: string | null;
}

export interface DelegationUser {
  id: string;
  fullName: string;
  email: string;
  role: { name: string };
}

export interface Delegation {
  id: string;
  fromUserId: string;
  toUserId: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  fromUser: DelegationUser;
  toUser: DelegationUser;
}

export interface DocumentListResponse {
  items: DocumentSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface WsEvent {
  type: string;
  documentId: string;
  title: string;
  actorName: string;
}

// Hộp thông báo trong app (R23) — bản ghi bền của mỗi sự kiện notify().
export interface NotificationItem {
  id: string;
  type: string;
  documentId: string | null;
  title: string;
  actorName: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  unreadCount: number;
}

export interface DashboardData {
  isAdmin: boolean;
  myByStatus: Record<string, number>;
  myTotal: number;
  pendingForMe: number;
  monthly: { month: string; count: number }[];
  allByStatus?: Record<string, number>;
  allTotal?: number;
  byDepartment?: { department: string; count: number }[];
}
