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
  email: string;
  fullName: string;
  roleId: string;
  departmentId: string;
  createdAt: string;
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
  createdAt: string;
}

export interface WorkflowStep {
  id: string;
  workflowId: string;
  stepOrder: number;
  approverRole: string;
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
  title: string;
  type: "PURCHASE" | "PAYMENT" | "GENERAL";
  formData: unknown;
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
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
}

export interface WsEvent {
  type: string;
  documentId: string;
  title: string;
  actorName: string;
}
